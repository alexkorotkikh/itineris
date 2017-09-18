import * as Rx from 'rxjs';
import * as winston from "winston";
import EtcValueNode from "promise-etcd/dist/lib/etc-value-node";
import EtcdPromise from "promise-etcd/dist/lib/etcd-promise";

interface NodeInfo {
    nodeName: string;
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

export function createEndpointInfo(etcValueNode: EtcValueNode): EndpointInfo {
    const name = etcValueNode.key.slice(etcValueNode.key.lastIndexOf('/') + 1);
    const value = JSON.parse(etcValueNode.value);

    const nodeInfos = [];
    for (let nodeName in value.nodes) {
        nodeInfos.push({
            nodeName: nodeName,
            ip: value.nodes[nodeName].ip,
            port: value.nodes[nodeName].port,
        })
    }

    const tlsInfo = {
        tlsChain: value.tls.chain,
        tlsCert: value.tls.cert,
        tlsKey: value.tls.key,
    };

    return {
        serviceName: name,
        nodeInfos: nodeInfos,
        tls: tlsInfo,
    };
}

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