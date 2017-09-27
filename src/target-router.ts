import * as http from 'http';
import * as etcd from 'promise-etcd';
import * as Rx from 'rxjs';
import * as rq from 'request';
import * as url from 'url';
import * as yargs from 'yargs';
import * as winston from 'winston';
import IPAddress from 'ipaddress';

export class TargetRouter {
  private etc: etcd.EtcdObservable;
  private changeWaiter: etcd.ChangeWaiter;
  private routes: Route[];

  constructor(etc: etcd.EtcdObservable) {
    this.etc = etc;
    this.routes = [];
    this.changeWaiter = etc.createChangeWaiter('targets');
    this.changeWaiter.subscribe(this.updateRoutes);
  }

  route(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.findTarget(req).subscribe((apply: Apply) => {
      apply(req, res);
    })
  }

  private findTarget(req: http.IncomingMessage): Rx.Observable<Apply> {
    return Rx.Observable.create((observer: Rx.Observer<Apply>) => {
      this.getRoute(req, observer) || this.internalError(observer);
    });
  }

  private getRoute(req: http.IncomingMessage, observer: Rx.Observer<Apply>) {
    const route = this.routes.find(route => route.isApplicable(req));
    observer.next((request, response) => {
      request
        .pipe(rq({ qs: url.parse(request.url).query, uri: route.url.toString() }))
        .pipe(response);
    });
  }

  private internalError(observer: Rx.Observer<Apply>) {
    observer.next((req, res) => {
      res.statusCode = 500;
      res.write('500 Internal Server Error');
      res.end();
    });
  }

  private updateRoutes() {
  }
}

interface Route {
  url: URL;

  isApplicable(req: http.IncomingMessage): boolean;
}

interface Apply {
  (req: http.IncomingMessage, res: http.ServerResponse): void;
}

export class Target {
  private readonly log: winston.LoggerInstance;
  public readonly name: string;
  public hosts: IPAddress[];
  public metadata: any;

  constructor(targetName: string, log: winston.LoggerInstance) {
    this.name = targetName;
    this.log = log;
  }


  static cli(y: yargs.Argv, etc: etcd.EtcdObservable, upset: etcd.Upset,
             log: winston.LoggerInstance, obs: Rx.Observer<string>) {
    y.command('target', 'target commands', (_argvv) => {
      const opTargetName = {
        'targetName': {
          description: 'Name of the target',
          require: true
        }
      };
      const opTargetOptions = {
        ...opTargetName,
        'metadata': {
          description: 'target\'s metadata',
          required: true
        },
      };
      const targets = yargs.usage('$0 target <cmd> [args]')
        .command('add', 'adds a target', opTargetName, (argv) => {
          etc.mkdir('targets').subscribe(() => {
            upset.upSet(`targets/${argv.targetName}`, (targetJson: any, out: Rx.Subject<any>) => {
              try {
                if (targetJson) {
                  obs.error('target already exists');
                } else {
                  const target = new Target(argv.targetName, log);
                  out.next(target.toObject());
                }
              } catch (e) {
                obs.error(e)
              }
            }).subscribe(() => {
              obs.next('target was added')
            });
          });
        })
        .command('list', 'list all targets', {}, (argv) => {
          etc.getRaw('targets', { recursive: true }).subscribe(resp => {
            try {
              if (resp.isErr()) {
                obs.error(JSON.stringify(resp.err));
              } else {
                const targets = resp.node.nodes.map(n => Target.loadFrom(JSON.parse(n.value), log).toObject());
                obs.next(JSON.stringify(targets));
              }
            } catch (e) {
              obs.error(e);
            }
          }, obs.error)
        })
        .command('remove', 'removes a target', opTargetName, (argv) => {
          etc.delete(`targets/${argv.targetName}`).subscribe(resp => {
            if (resp.isErr()) {
              obs.error(resp.err);
            }
            else {
              obs.next('target was removed');
            }
          });
        })
        .command('set', 'options to a target', opTargetOptions, (argv) => {
          let metadata: any;
          try {
            metadata = JSON.parse(argv.metadata);
          } catch (e) {
            obs.error(e);
            return;
          }
          upset.upSet(`targets/${argv.targetName}`, (targetJson: any, out: Rx.Subject<any>) => {
            const target = Target.loadFrom(targetJson, log);
            target.metadata = metadata || target.metadata;
            out.next(target.toObject());
          }).subscribe(() => {
            obs.next('target options were set');
          });
        })
        .command('unset', 'options to a target', opTargetOptions, (argv) => {
          upset.upSet(`targets/${argv.targetName}`, (targetJson: any, out: Rx.Subject<any>) => {
            const target = Target.loadFrom(targetJson, log);
            target.metadata = {};
            out.next(target.toObject());
          }).subscribe(() => {
            obs.next('target options were unset');
          });
        })
        .command('hosts', 'handle hosts', (__argv): yargs.Argv => {
          const hosts = yargs.usage('$0 service hosts <cmd> [args]');
          const opHost = {
            ...opTargetName,
            'host': {
              description: 'new host tp add',
              required: true,
            }
          };
          hosts.command('add', 'add host', opHost, (argv) => {
            let host: IPAddress;
            try {
              host = IPAddress.parse(argv.host);
            } catch (e) {
              obs.error(e);
              return;
            }
            upset.upSet(`targets/${argv.targetName}`, (targetJson: any, out: Rx.Subject<any>) => {
              const target = Target.loadFrom(targetJson, log);
              if (target.hosts.find((h: any) => h.eq(host))) {
                obs.error('host already added');
              } else {
                target.addHost(host);
                out.next(target.toObject());
              }
            }).subscribe(() => {
              obs.next('host was added to target');
            });
          })
            .command('list', 'list hosts', opTargetName, (argv) => {
              etc.getJson(`targets/${argv.targetName}`).subscribe((resp) => {
                if (resp.isErr()) {
                  obs.error(resp.err)
                } else {
                  const target = Target.loadFrom(resp.value, log);
                  if (!target.hosts) target.hosts = [];
                  const hs = target.hosts.map((h: IPAddress) => h.to_s());
                  obs.next(JSON.stringify(hs));
                }
              })
            })
            .command('remove', 'remove host', opHost, (argv) => {
              let host: IPAddress;
              try {
                host = IPAddress.parse(argv.host);
              } catch (e) {
                obs.error(e);
                return;
              }
              upset.upSet(`targets/${argv.targetName}`, (targetJson: any, out: Rx.Subject<any>) => {
                const target = Target.loadFrom(targetJson, log);
                const h = target.removeHost(host);
                if (!h) {
                  obs.error('host does not exist')
                } else {
                  out.next(target.toObject());
                }
              }).subscribe(() => {
                obs.next('host was removed from target');
              })
            });
          return hosts;
        });

      return targets;
    });
  }

  static loadFrom(obj: any, log: winston.LoggerInstance): Target {
    const ret = new Target(obj.name, log);
    (obj.hosts || []).forEach((host: string) => ret.addHost(IPAddress.parse(host)));
    ret.metadata = obj.metadata || {};
    return ret;
  }

  toObject(): any {
    return {
      name: this.name,
      urls: this.hosts.map(u => u.to_s()),
      metadata: this.metadata,
    };
  }

  addHost(host: IPAddress): IPAddress {
    this.hosts.push(host);
    return host;
  }

  removeHost(host: IPAddress): IPAddress {
    const filtered = this.hosts.filter(h => h.eq(host));
    if (!filtered || filtered.length === this.hosts.length) {
      this.log.error('host does mot exist');
      return null;
    }
    this.hosts = filtered;
    return host;
  }
}