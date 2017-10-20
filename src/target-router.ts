import * as http from 'http';
import * as etcd from 'promise-etcd';
import * as Rx from 'rxjs';
import * as rq from 'request';
import * as url from 'url';
import * as yargs from 'yargs';
import * as winston from 'winston';
import { Endpoint, IpPort } from './endpoint';
import { Route } from './router';

export class TargetRouter {
  private etc: etcd.EtcdObservable;
  private targets: Target[];
  private routes: Route[];

  constructor(etc: etcd.EtcdObservable) {
    this.etc = etc;
    this.targets = [];
    this.routes = [];
  }

  route(req: http.IncomingMessage, res: http.ServerResponse, endpoint: Endpoint): void {
    this.findTarget(req, endpoint.name).subscribe((apply: Apply) => {
      apply(req, res);
    })
  }

  private findTarget(req: http.IncomingMessage, endpointName: string): Rx.Observable<Apply> {
    return Rx.Observable.create((observer: Rx.Observer<Apply>) => {
      this.getRoute(req, observer, endpointName) || TargetRouter.internalError(observer);
    });
  }

  private getRoute(req: http.IncomingMessage, observer: Rx.Observer<Apply>, endpointName: string): any {
    const route = this.routes.find(route => route.isApplicable(req, endpointName));
    if (!route) return null;
    const targetNameFunc = new Function('req', route.rule);
    const targetName = targetNameFunc(req);
    const target = this.targets.find(target => target.name === targetName);
    if (!target) return null;
    observer.next((request, response) => {
      const targetHost = target.hosts[Math.floor(Math.random() * target.hosts.length)];
      const url = 'http://' + targetHost.toString() + request.url;
      request.pipe(rq(url)).pipe(response);
    });
    return url;
  }

  private static internalError(observer: Rx.Observer<Apply>) {
    observer.next((req, res) => {
      res.statusCode = 500;
      res.write('500 Internal Server Error');
      res.end();
    });
  }

  updateTargets(targets: Target[]): Rx.Observable<string> {
    return Rx.Observable.create((observer: Rx.Observer<string>) => {
      this.targets = targets;
      observer.next(JSON.stringify(targets.map(t => t.toObject())));
    });
  }

  updateRoutes(routes: Route[]): Rx.Observable<string> {
    return Rx.Observable.create((observer: Rx.Observer<string>) => {
      this.routes = routes;
      observer.next(JSON.stringify(routes.map(r => r.toObject())));
    });
  }
}

interface Apply {
  (req: http.IncomingMessage, res: http.ServerResponse): void;
}

export class Target {
  private readonly log: winston.LoggerInstance;
  public readonly name: string;
  public hosts: IpPort[];
  public metadata: any;

  constructor(targetName: string, log: winston.LoggerInstance) {
    this.name = targetName;
    this.log = log;
    this.hosts = [];
  }

  static cli(y: yargs.Argv, etc: etcd.EtcdObservable, upset: etcd.Upset,
             log: winston.LoggerInstance, obs: Rx.Observer<string>) {
    y.command('target', 'target commands', () => {
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
      return yargs.usage('$0 target <cmd> [args]')
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
        .command('list', 'list all targets', {}, () => {
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
        .command('hosts', 'handle hosts', (): yargs.Argv => {
          const hosts = yargs.usage('$0 service hosts <cmd> [args]');
          const opHost = {
            ...opTargetName,
            'ip': {
              description: 'IP address of the target',
              required: true
            },
            'port': {
              description: 'Port of the target',
              required: true
            },
          };
          hosts.command('add', 'add host', opHost, (argv) => {
            const host = IpPort.loadFrom({ ip: argv.ip, port: argv.port }, log);
            if (!host) {
              obs.error(new Error('ip and/or port not valid'));
              return;
            }
            upset.upSet(`targets/${argv.targetName}`, (targetJson: any, out: Rx.Subject<any>) => {
              const target = Target.loadFrom(targetJson, log);
              if (target.hosts.find((h: IpPort) => h.equals(host))) {
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
                  const hs = target.hosts.map((h: IpPort) => h.toString());
                  obs.next(JSON.stringify(hs));
                }
              })
            })
            .command('remove', 'remove host', opHost, (argv) => {
              const host = IpPort.loadFrom({ ip: argv.ip, port: argv.port }, log);
              if (!host) {
                obs.error(new Error('ip and/or port not valid'));
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
    });
  }

  static loadFrom(obj: any, log: winston.LoggerInstance): Target {
    const ret = new Target(obj.name, log);
    (obj.hosts || []).forEach((host: any) => ret.addHost(IpPort.loadFrom(host, log)));
    ret.metadata = obj.metadata || {};
    return ret;
  }

  toObject(): any {
    return {
      name: this.name,
      hosts: this.hosts.map(h => h && h.toObject()),
      metadata: this.metadata,
    };
  }

  addHost(host: IpPort): IpPort {
    this.hosts.push(host);
    return host;
  }

  removeHost(host: IpPort): IpPort {
    const filtered = this.hosts.filter(h => !h.equals(host));
    if (filtered.length === this.hosts.length) {
      this.log.error('host does not exist');
      return null;
    }
    this.hosts = filtered;
    return host;
  }
}
