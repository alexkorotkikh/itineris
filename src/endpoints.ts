import * as etcd from "promise-etcd";

class NodeInfo {
    ip: string;
    port: string;

    constructor(ip: string, port: string) {
        this.ip = ip;
        this.port = port;
    }
}

class TlsInfo {
    tlsChain: string;
    tlsCert: string;
    tlsKey: string;

    constructor(tlsChain: string, tlsCert: string, tlsKey: string) {
        this.tlsChain = tlsChain;
        this.tlsCert = tlsCert;
        this.tlsKey = tlsKey;
    }
}

export class EndpointInfo {
    private serviceName: String;
    private nodeInfos: NodeInfo[];
    private tls: TlsInfo;

    private constructor(serviceName: String, nodeInfos: NodeInfo[], tls: TlsInfo) {
        this.serviceName = serviceName;
        this.nodeInfos = nodeInfos;
        this.tls = tls;
    }

    static create(val: etcd.EtcValueNode): EndpointInfo {
        const serviceName = val.key.slice(val.key.lastIndexOf('/') + 1);

        const nds = val.nodes.find((node) => node.key.endsWith('nds'));
        let nodeInfos: NodeInfo[] = [];
        if (nds) {
            nodeInfos = nds.nodes
                .map((node) => JSON.parse(node.value))
                .map((json) => new NodeInfo(json.ip, json.port));
        }

        const tls = val.nodes.find((node) => node.key.endsWith('tls'));
        let tlsInfo: TlsInfo;
        if (tls) {
            const tlsChain = tls.nodes.find((node) => node.key.endsWith('chain')).value.toString()
            const tlsCert = tls.nodes.find((node) => node.key.endsWith('cert')).value.toString()
            const tlsKey = tls.nodes.find((node) => node.key.endsWith('key')).value.toString()
            tlsInfo = new TlsInfo(tlsChain, tlsCert, tlsKey)
        }

        return new EndpointInfo(serviceName, nodeInfos, tlsInfo);
    }
}