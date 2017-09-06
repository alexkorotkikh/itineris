import * as etcd from "promise-etcd";

class NodeInfo {
}

class TlsInfo {
}

export class EndpointInfo {
    private serviceName: String;
    private nodes: NodeInfo[];
    private tls: TlsInfo;

    private constructor(serviceName: String, nodes: NodeInfo[], tls: TlsInfo) {
        this.serviceName = serviceName;
        this.nodes = nodes;
        this.tls = tls;
    }

    static create(val: etcd.EtcValueNode): EndpointInfo {
        const serviceName = val.key.slice(val.key.lastIndexOf('/') + 1);
        return new EndpointInfo(serviceName, null, null);
    }
}