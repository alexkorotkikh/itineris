import * as etcd from "promise-etcd";
import { EtcValueNode } from "promise-etcd";
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
    const name = val.key.slice(val.key.lastIndexOf('/') + 1);

    const nds = val.nodes.find((node) => node.key.endsWith('nodes'));
    const nodeInfos: NodeInfo[] = nds &&
        nds.nodes
            .map(node => JSON.parse(node.value))
            .map(json => {
                return { ip: json.ip, port: json.port };
            });


    const tls = val.nodes.find((node) => node.key.endsWith('tls'));
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

    start(): Rx.Observable<EtcValueNode[]> {
        return Rx.Observable.create((observer: Rx.Observer<etcd.EtcValueNode[]>) => {
            etcd.WaitMaster.create('', this.etc, 1000, 10000,
                () => {
                    this.logger.info("WaitMaster started");
                },
                () => {
                    this.logger.error("WaitMaster stopped");
                }
            ).then((list) => {
                observer.next(list.value as etcd.EtcValueNode[]);
            });
        })
    }
}

export class EndpointInfoStorage {

    update(val: EtcValueNode[]): Rx.Observable<EndpointInfo[]> {
        return Rx.Observable.create((observer: Rx.Observer<EndpointInfo[]>) => {
            const infos = val.map(createEndpointInfo);
            observer.next(infos);
        });

    }
}