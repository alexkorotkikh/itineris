import * as rx from 'rxjs';
import * as winston from 'winston';
import * as yargs from 'yargs';
import { IPAddress } from 'ipaddress';
import * as etcd from 'promise-etcd';

export class IpPort {
  private readonly log: winston.LoggerInstance;
  public readonly ip: IPAddress;
  public readonly port: number;

  public static loadFrom(obj: any, log: winston.LoggerInstance): IpPort {
    const ip = IPAddress.parse(obj.ip);
    if (!ip) {
      log.error('unparsable ip address', obj.ip);
      return null;
    }
    const port = parseInt(obj.port, 10);
    if (!(0 <= port && port << 65536)) {
      log.error('port not in range', port);
      return null;
    }
    return new IpPort(ip, port, log);
  }

  constructor(ip: IPAddress, port: number, log: winston.LoggerInstance) {
    this.log = log;
    this.ip = ip;
    this.port = port;
  }

  public equals(oth: IpPort): boolean {
    return this.ip.eq(oth.ip) && oth.port == this.port;
  }
}

export class Node {
  private readonly log: winston.LoggerInstance;
  public readonly name: string;
  private binds: IpPort[];

  public static cli(y: yargs.Argv, opNodeName: any, obs: rx.Observer<string>): yargs.Argv {
    return y.command('node', 'handle node', (__argv): yargs.Argv => {
      const opIpPort = Object.assign({
        'ip': {
          description: 'IP address of the endpoint',
          required: true
        },
        'port': {
          description: 'Port of the endpoint',
          required: true
        }
      }, opNodeName);
      const node = yargs.usage('$0 service node <cmd> [args]');
      node.command('add', 'add ipport by name', opIpPort, (argv) => {
        obs.next('node added')
      });
      node.command('list', 'list ipport by name', opNodeName, (argv) => {
        /* */
      });
      node.command('remove', 'remove ipport by name', opIpPort, (argv) => {
        /* */
      });
      return node;
    });
  }

  constructor(name: string, log: winston.LoggerInstance) {
    this.name = name;
    this.log = log;
    this.binds = [];
  }

  public addBind(ipPort: IpPort): IpPort {
    if (!ipPort) {
      this.log.error('addBind missing ipPort');
      return null;
    }
    if (this.binds.find(ipp => ipp.equals(ipPort))) {
      this.log.error('addBind ipPort duplicated', ipPort);
      return null;
    }
    this.binds.push(ipPort);
    return ipPort;
  }

  public listBinds(): IpPort[] {
    return this.binds;
  }

  public removeBind(ipPort: IpPort): IpPort {
    const filtered = this.binds.filter(n => !n.equals(ipPort));
    if (!name || this.binds.length == filtered.length) {
      this.log.error('addnode: node name not found:', name);
      return null;
    }
    const found = this.binds.find(n => n.equals(ipPort));
    this.binds = filtered;
    return found;
  }

  public loadFrom(obj: any): Node {
    (obj.binds || []).forEach((_obj: any) => this.addBind(IpPort.loadFrom(_obj, this.log)));
    return this;
  }

}

export class Tls {
  private readonly log: winston.LoggerInstance;
  public tlsChain: string;
  public tlsCert: string;
  public tlsKey: string;

  public static loadFrom(obj: any, log: winston.LoggerInstance): Tls {
    const ret = new Tls(log);
    ret.tlsChain = obj.tlsChain;
    ret.tlsCert = obj.tlsCert;
    ret.tlsKey = obj.tlsKey;
    return ret;
  }

  constructor(log: winston.LoggerInstance) {
    this.log = log;
  }
}

export class EndPoint {
  private readonly log: winston.LoggerInstance;
  public readonly name: string;
  public nodes: Node[];
  public tls: Tls;

  public static cli(y: yargs.Argv, etc: etcd.EtcdObservable, upset: etcd.Upset,
                    obs: rx.Observer<string>): void {
    y.command('endpoint', 'endpoint commands', (_argv): yargs.Argv => {
      const opEndpointName = {
        'endpointName': {
          description: 'Name of the endpoint',
          require: true
        }
      };
      const opNodeName = Object.assign({
        'nodeName': {
          description: 'Name of the node',
          require: true
        }
      }, opEndpointName);
      const x = yargs.usage('$0 endpoint <cmd> [args]')
        .command('add', 'adds a endpoint', opEndpointName, (argv) => {
          upset.upSet(`endpoints/${argv.endpointName}`, (endpoint: any, out: rx.Subject<any>) => {
            if (endpoint) {
              obs.error('endpoint already exists');
            } else {
              out.next({
                name: argv.endpointName,
                nodes: [],
                tls: {},
              })
            }
          }).subscribe(() => {
            obs.next('endpoint was added')
          });
        })
        .command('list', 'list endpoint', {}, (argv) => {
          etc.getJson('endpoints', { recursive: true }).subscribe(resp => {
            if (resp.isErr()) {
              obs.error(JSON.stringify(resp.err));
            }
            else {
              obs.next(JSON.stringify(resp));
            }
          })
        })
        .command('remove', 'remove a endpoint', opEndpointName, (argv) => {
          etc.delete(`endpoints/${argv.endpointName}`).subscribe(resp => {
            if (resp.isErr()) {
              obs.error(resp.err);
            }
            else {
              obs.next('endpoint was removed');
            }
          });
        })
        .command('set', 'options to a endpoint', {
          'tls-cert': {
            description: 'Path to TLS certificate file',
            required: true
          },
          'tls-chain': {
            description: 'Path to TLS chain file',
            required: true
          },
          'tls-key': {
            description: 'Path to TLS key file',
            required: true
          }
        }, (argv) => {
          upset.upSet(`endpoints/${argv.endpointName}`, (endpoint: any, out: rx.Subject<any>) => {
            endpoint.tls.tlsKey = argv.tlsKey || endpoint.tls.tlsKey;
            endpoint.tls.tlsCert = argv.tlsCert || endpoint.tls.tlsCert;
            endpoint.tls.tlsChain = argv.tlsChain || endpoint.tls.tlsChain;
            out.next(endpoint);
          }).subscribe(() => {
            obs.next('endpoint options were set');
          });
        })
        .command('unset', 'remove options from a endpoint', {}, (argv) => {
          upset.upSet(`endpoints/${argv.endpointName}`, (endpoint: any, out: rx.Subject<any>) => {
            endpoint.tls.tlsKey = null;
            endpoint.tls.tlsCert = null;
            endpoint.tls.tlsChain = null;
            out.next(endpoint);
          }).subscribe(() => {
            obs.next('endpoint options were unset');
          });
        })
        .command('nodes', 'handle nodes', (__argv): yargs.Argv => {
          const nodes = yargs.usage('$0 service nodes <cmd> [args]');
          nodes.command('add', 'add node by name', opNodeName, (argv) => {
            upset.upSet(`endpoints/${argv.endpointName}`, (endpoint: any, out: rx.Subject<any>) => {
              if (!endpoint.nodes) endpoint.nodes = [];
              if (endpoint.nodes.find((n: any) => n.name === argv.nodeName)) {
                obs.error('node already exist');
              } else {
                endpoint.nodes.push({ name: argv.nodeName });
                out.next(endpoint);
              }
            }).subscribe(() => {
              obs.next('node was added to endpoint');
            });
          });
          nodes.command('list', 'list node by name', opEndpointName, (argv) => {
            etc.getJson(`endpoints/${argv.endpointName}`).subscribe((resp) => {
              if (resp.isErr()) {
                obs.error(resp.err)
              } else {
                const endpoint = resp.value;
                if (!endpoint.nodes) endpoint.nodes = [];
                obs.next(endpoint.nodes);
              }
            })
          });
          nodes.command('remove', 'add node by name', opNodeName, (argv) => {
            upset.upSet(`endpoints/${argv.endpointName}`, (endpoint: any, out: rx.Subject<any>) => {
              if (!endpoint.nodes) endpoint.nodes = [];
              const node = endpoint.removeNode(argv.nodeName);
              if (!node) {
                obs.error('node does not exist')
              } else {
                out.next(endpoint);
              }
            }).subscribe(() => {
              obs.next('node was removed from endpoint');
            })
          });
          return nodes;
        });

      Node.cli(x, opNodeName, obs);

      return x;
    });
  }

  public static loadFrom(obj: any, log: winston.LoggerInstance): EndPoint {
    const ret = new EndPoint(obj.name, log);
    (obj.nodes || []).forEach((_obj: any) => ret.addNode(_obj.name).loadFrom(_obj));
    ret.tls = Tls.loadFrom(obj.tls, log);
    return ret;
  }

  constructor(name: string, log: winston.LoggerInstance) {
    this.name = name;
    this.log = log;
    this.nodes = [];
  }

  public addNode(name: string): Node {
    if (!name || this.nodes.find(n => n.name === name)) {
      this.log.error('addnode: duplicate node name:', name);
      return null;
    }
    const ret = new Node(name, this.log);
    this.nodes.push(ret);
    return ret;
  }

  public listNodes(): Node[] {
    return this.nodes;
  }

  public removeNode(name: string): Node {
    const filtered = this.nodes.filter(n => n.name != name);
    if (!name || this.nodes.length == filtered.length) {
      this.log.error('addnode: node name not found:', name);
      return null;
    }
    const found = this.nodes.find(n => n.name === name);
    this.nodes = filtered;
    return found;
  }

}

/*
export class EndpointInfoSource {
    private etc: EtcdPromise;
    private logger: winston.LoggerInstance;

    constructor(etc: EtcdPromise, logger: winston.LoggerInstance) {
        this.etc = etc;
        this.logger = logger;
    }

    start(): Rx.Observable<EtcValueNode> {
        return Rx.Observable.create((observer: Rx.Observer<EtcValueNode>) => {
            this.etc.createChangeWaiter('', { recursive: true })
                .subscribe((res) => {
                    observer.next(res.node);
                })
        });
    }
}

export class EndpointInfoStorage {
    private logger: winston.LoggerInstance;
    private nodesInfo: EndpointInfo[];

    constructor(logger: winston.LoggerInstance) {
        this.logger = logger;
        this.nodesInfo = [];
    }

    update(val: any): Rx.Observable<EndpointInfo> {
        return Rx.Observable.create((observer: Rx.Observer<EndpointInfo>) => {
            this.logger.info(JSON.stringify(val));
            const changed = val && createEndpointInfo(val);

            this.nodesInfo = this.nodesInfo.filter(i => i.serviceName !== changed.serviceName);
            this.nodesInfo.push(changed);

            observer.next(changed);
        });
    }
}
*/
