import { EtcValueNode } from "promise-etcd";
import { createEndpointInfo, EndpointInfo } from "../src/endpoints";
import { assert } from 'chai';

const etcValueNode = EtcValueNode.fromJson({
    "dir": false,
    "nodes": null,
    "key": "/HelloWorld/ClusterWorld/test-service",
    "modifiedIndex": 6760,
    "value": "{\"nodes\":{\"test-node\":{\"ip\":\"127.0.0.1\",\"port\":8080}},\"tls\":{\"cert\":\"test-cert\",\"chain\":\"test-chain\",\"key\":\"test-key\"}}"
});

describe("EndpointInfo", function () {
    it("should be parsed from EtcValueNode", function (done) {
        const endpointInfo = createEndpointInfo(etcValueNode);

        assert.equal(endpointInfo.serviceName, "test-service");
        assert.equal(endpointInfo.nodeInfos.length, 1);
        assert.equal(endpointInfo.nodeInfos[0].nodeName, "test-node");
        assert.equal(endpointInfo.nodeInfos[0].ip, "127.0.0.1");
        assert.equal(endpointInfo.nodeInfos[0].port, "8080");
        assert.equal(endpointInfo.tls.tlsCert, "test-cert");
        assert.equal(endpointInfo.tls.tlsChain, "test-chain");
        assert.equal(endpointInfo.tls.tlsKey, "test-key");

        done();
    });
});