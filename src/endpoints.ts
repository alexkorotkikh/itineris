import * as etcd from "promise-etcd";
import { EtcValueNode, WaitMaster } from "promise-etcd";
import * as Rx from 'rxjs';
import * as winston from "winston";

interface NodeInfo {
    ip: string;
    port: string;
}

interface TlsInfo {
    tlsChain: string;
    tlsCert: string;
    tlsKey: string;
}

export interface EndpointInfo {
    serviceName: String;
    nodeInfos: NodeInfo[];
    tls: TlsInfo;
}

export function createEndpointInfo(val: etcd.EtcValueNode): EndpointInfo {
    const name = val && val.key && val.key.slice(val.key.lastIndexOf('/') + 1);

    const nds = val.nodes && val.nodes.find((node) => node.key.endsWith('nodes'));
    const nodeInfos: NodeInfo[] = nds &&
        nds.nodes
            .map(node => JSON.parse(node.value))
            .map(json => {
                return { ip: json.ip, port: json.port };
            });


    const tls = val.nodes && val.nodes.find((node) => node.key.endsWith('tls'));
    const tlsInfo: TlsInfo = tls && {
        tlsChain: tls.nodes.find((node) => node.key.endsWith('chain')).value.toString(),
        tlsCert: tls.nodes.find((node) => node.key.endsWith('cert')).value.toString(),
        tlsKey: tls.nodes.find((node) => node.key.endsWith('key')).value.toString(),
    };

    return {
        serviceName: name,
        nodeInfos: nodeInfos,
        tls: tlsInfo,
    };
}

export class EndpointInfoSource {
    private etc: etcd.Etcd;
    private logger: winston.LoggerInstance;

    constructor(etc: etcd.Etcd, logger: winston.LoggerInstance) {
        this.etc = etc;
        this.logger = logger;
    }

    start(): Rx.Observable<EtcValueNode> {
        return Rx.Observable.create((observer: Rx.Observer<etcd.EtcValueNode>) => {
            etcd.WaitMaster.create('test-key', this.etc, 1000, 10000,
                () => this.logger.info("WaitMaster started"),
                () => this.logger.error("WaitMaster stopped"),
            ).then((master: WaitMaster) => {
                Rx.Observable.fromPromise(master.currentWait).subscribe(update => {
                    this.logger.info(update);
                    observer.next(update)
                });
            });
        })
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
            const changed = val && createEndpointInfo(val.node);

            this.nodesInfo = this.nodesInfo.filter(i => i.serviceName !== changed.serviceName);
            this.nodesInfo.push(changed);

            observer.next(changed);
        });
    }
}