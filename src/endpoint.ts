import * as fs from 'fs';
import * as Rx from 'rxjs';
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

  toObject(): any {
    return { ip: this.ip.to_s(), port: this.port }
  }

  toString(): string {
    return `${this.ip.to_s()}:${this.port}`
  }
}

export class Node {
  private readonly log: winston.LoggerInstance;
  public readonly name: string;
  private binds: IpPort[];

  public static cli(y: yargs.Argv, opNodeName: any, etc: etcd.EtcdObservable, upset: etcd.Upset,
                    log: winston.LoggerInstance, obs: Rx.Observer<string>): yargs.Argv {
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
        upset.upSet(`endpoints/${argv.endpointName}`, (endpointJson: any, out: Rx.Subject<any>) => {
          const endpoint = Endpoint.loadFrom(endpointJson, log);
          const node = endpoint.nodes.find((n: any) => n.name === argv.nodeName);
          if (!node) {
            obs.error('node does not exist')
          } else {
            try {
              const ip = IPAddress.parse(argv.ip);
              const port = parseInt(argv.port);
              const bind = node.addBind(new IpPort(ip, port, log));
              if (!bind) {
                obs.error('bind was not added');
              } else {
                out.next(endpoint.toObject());
              }
            } catch (e) {
              obs.error(e)
            }
          }
        }).subscribe(() => {
          obs.next('bind added to node')
        });
      });
      node.command('list', 'list ipport by name', opNodeName, (argv) => {
        etc.getJson(`endpoints/${argv.endpointName}`).subscribe((resp) => {
          if (resp.isErr()) {
            obs.error(resp.err)
          } else {
            const endpoint = resp.value;
            if (!endpoint.nodes) endpoint.nodes = [];
            const node = endpoint.nodes.find((n: any) => n.name === argv.nodeName);
            if (!node) {
              obs.error('node does not exist')
            } else {
              obs.next(node.binds);
            }
          }
        });
      });
      node.command('remove', 'remove ipport by name', opIpPort, (argv) => {
        upset.upSet(`endpoints/${argv.endpointName}`, (endpointJson: any, out: Rx.Subject<any>) => {
          try {
            const endpoint = Endpoint.loadFrom(endpointJson, log);
            const node = endpoint.nodes.find((n: any) => n.name === argv.nodeName);
            if (!node) {
              obs.error('node does not exist')
            } else {
              const bind = new IpPort(IPAddress.parse(argv.ip), parseInt(argv.port), log);
              const removedBind = node.removeBind(bind);
              if (!removedBind) {
                obs.error('bind does not exist')
              } else {
                out.next(endpoint.toObject());
              }
            }
          }
          catch (e) {
            console.log(e);
          }
        }).subscribe(() => {
          obs.next('bind was removed');
        }, err => obs.error(err));
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
    if (/*!name ||*/ this.binds.length == filtered.length) {
      this.log.error('removeBind: node name not found:', name);
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

  toObject(): any {
    return { name: this.name, binds: this.binds.map(b => b.toObject()) }
  }

  equals(other: Node): boolean {
    if (this.name !== other.name) {
      return false;
    }
    if (this.binds.length !== other.binds.length) {
      return false;
    }
    for (let i = 0; i < this.binds.length; i++) {
      if (!this.binds[i].equals(other.binds[i])) {
        return false;
      }
    }
    return true;
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

  toObject(): any {
    return {
      tlsChain: this.tlsChain,
      tlsCert: this.tlsCert,
      tlsKey: this.tlsKey,
    };
  }

  equals(other: Tls): boolean {
    return this.tlsKey === other.tlsKey &&
      this.tlsCert === other.tlsCert &&
      this.tlsChain === other.tlsChain;
  }
}

export class Endpoint {
  private readonly log: winston.LoggerInstance;
  public readonly name: string;
  public nodes: Node[];
  public tls: Tls;

  public static cli(y: yargs.Argv, etc: etcd.EtcdObservable, upset: etcd.Upset,
                    log: winston.LoggerInstance, obs: Rx.Observer<string>): void {
    y.command('endpoint', 'endpoint commands', () => {
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
      const endpoints = yargs.usage('$0 endpoint <cmd> [args]')
        .command('add', 'adds a endpoint', opEndpointName, (argv) => {
          etc.mkdir('endpoints').subscribe(() => {
            upset.upSet(`endpoints/${argv.endpointName}`, (endpointJson: any, out: Rx.Subject<any>) => {
              try {
                if (endpointJson) {
                  obs.error('endpoint already exists');
                } else {
                  const endpoint = new Endpoint(argv.endpointName, log);
                  out.next(endpoint.toObject());
                }
              } catch (e) {
                obs.error(e)
              }
            }).subscribe(() => {
              obs.next('endpoint was added')
            }, obs.error);
          }, obs.error);
        })
        .command('list', 'list endpoint', {}, () => {
          etc.getRaw('endpoints', { recursive: true }).subscribe(resp => {
            try {
              if (resp.isErr()) {
                obs.error(JSON.stringify(resp.err));
              } else {
                const endpoints = resp.node.nodes.map(n => Endpoint.loadFrom(JSON.parse(n.value), log).toObject());
                obs.next(JSON.stringify(endpoints));
              }
            } catch (e) {
              obs.error(e);
            }
          }, obs.error)
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
          ...opEndpointName,
          'tls-cert': {
            description: 'Path to TLS certificate file',
            required: true
          },
          'tls-chain': {
            description: 'Path to TLS chain file',
            required: false
          },
          'tls-key': {
            description: 'Path to TLS key file',
            required: true
          }
        }, (argv) => {
          upset.upSet(`endpoints/${argv.endpointName}`, (endpointJson: any, out: Rx.Subject<any>) => {
            try {
              const endpoint = Endpoint.loadFrom(endpointJson, log);
              const get = (val: fs.PathLike) => val && fs.readFileSync(val, 'utf8');
              endpoint.tls.tlsKey = get(argv.tlsKey) || endpoint.tls.tlsKey;
              endpoint.tls.tlsCert = get(argv.tlsCert) || endpoint.tls.tlsCert;
              endpoint.tls.tlsChain = get(argv.tlsChain) || endpoint.tls.tlsChain;
              out.next(endpoint.toObject());
            } catch (e) {
              obs.error(e);
            }
          }).subscribe(() => {
            obs.next('endpoint options were set');
          }, console.error);
        })
        .command('unset', 'remove options from a endpoint', {}, (argv) => {
          upset.upSet(`endpoints/${argv.endpointName}`, (endpointJson: any, out: Rx.Subject<any>) => {
            const endpoint = Endpoint.loadFrom(endpointJson, log);
            endpoint.tls.tlsKey = null;
            endpoint.tls.tlsCert = null;
            endpoint.tls.tlsChain = null;
            out.next(endpoint.toObject());
          }).subscribe(() => {
            obs.next('endpoint options were unset');
          });
        })
        .command('nodes', 'handle nodes', (): yargs.Argv => {
          const nodes = yargs.usage('$0 service nodes <cmd> [args]');
          nodes.command('add', 'add node by name', opNodeName, (argv) => {
            upset.upSet(`endpoints/${argv.endpointName}`, (endpointJson: any, out: Rx.Subject<any>) => {
              const endpoint = Endpoint.loadFrom(endpointJson, log);
              if (endpoint.nodes.find((n: any) => n.name === argv.nodeName)) {
                obs.error('node already exist');
              } else {
                endpoint.addNode(argv.nodeName);
                out.next(endpoint.toObject());
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
                const endpoint = Endpoint.loadFrom(resp.value, log);
                if (!endpoint.nodes) endpoint.nodes = [];
                const nodes = endpoint.nodes.map(n => n.toObject());
                obs.next(JSON.stringify(nodes));
              }
            })
          });
          nodes.command('remove', 'add node by name', opNodeName, (argv) => {
            upset.upSet(`endpoints/${argv.endpointName}`, (endpointJson: any, out: Rx.Subject<any>) => {
              const endpoint = Endpoint.loadFrom(endpointJson, log);
              const node = endpoint.removeNode(argv.nodeName);
              if (!node) {
                obs.error('node does not exist')
              } else {
                out.next(endpoint.toObject());
              }
            }).subscribe(() => {
              obs.next('node was removed from endpoint');
            })
          });
          return nodes;
        });

      Node.cli(endpoints, opNodeName, etc, upset, log, obs);

      return endpoints;
    });
  }

  public static loadFrom(obj: any, log: winston.LoggerInstance): Endpoint {
    const ret = new Endpoint(obj.name, log);
    (obj.nodes || []).forEach((_obj: any) => ret.addNode(_obj.name).loadFrom(_obj));
    ret.tls = obj.tls && Tls.loadFrom(obj.tls, log);
    return ret;
  }

  constructor(name: string, log: winston.LoggerInstance) {
    this.name = name;
    this.log = log;
    this.nodes = [];
  }

  public addNode(name: string): Node {
    if (!name || this.nodes.find(n => n.name === name)) {
      this.log.error('addNode: duplicate node name:', name);
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
      this.log.error('removeNode: node name not found:', name);
      return null;
    }
    const found = this.nodes.find(n => n.name === name);
    this.nodes = filtered;
    return found;
  }

  toObject(): any {
    return {
      name: this.name,
      nodes: this.nodes.map(n => n.toObject()),
      tls: (this.tls && this.tls.toObject()) || {},
    }
  }

  equals(other: Endpoint): boolean {
    if (this.name !== other.name) {
      return false;
    }
    if (!this.tls.equals(other.tls)) {
      return false;
    }
    if (this.nodes.length !== other.nodes.length) {
      return false;
    }
    for (let i = 0; i < this.nodes.length; i++) {
      if (!this.nodes[i].equals(other.nodes[i])) {
        return false;
      }
    }
    return true;
  }

}