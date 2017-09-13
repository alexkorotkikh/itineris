import { EtcValueNode } from "promise-etcd";
import { createEndpointInfo, EndpointInfo } from "../src/endpoints";
import { assert } from 'chai';

const etcValueNode = EtcValueNode.fromJson({
    "dir": true,
    "nodes": [
        {
            "dir": true,
            "nodes": [
                {
                    "dir": false,
                    "nodes": null,
                    "key": "/HelloWorld/ClusterWorld/test-service/nodes/test-node",
                    "modifiedIndex": 6,
                    "value": "{\"ip\":\"127.0.0.1\",\"port\":8080}"
                }
            ],
            "key": "/HelloWorld/ClusterWorld/test-service/nodes",
            "modifiedIndex": 5
        },
        {
            "dir": true,
            "nodes": [
                {
                    "dir": false,
                    "nodes": null,
                    "key": "/HelloWorld/ClusterWorld/test-service/tls/chain",
                    "modifiedIndex": 9,
                    "value": "test-chain"
                },
                {
                    "dir": false,
                    "nodes": null,
                    "key": "/HelloWorld/ClusterWorld/test-service/tls/key",
                    "modifiedIndex": 10,
                    "value": "test-key"
                },
                {
                    "dir": false,
                    "nodes": null,
                    "key": "/HelloWorld/ClusterWorld/test-service/tls/cert",
                    "modifiedIndex": 8,
                    "value": "test-cert"
                }
            ],
            "key": "/HelloWorld/ClusterWorld/test-service/tls",
            "modifiedIndex": 7
        }
    ],
    "key": "/HelloWorld/ClusterWorld/test-service",
    "modifiedIndex": 4
});

describe("EndpointInfo", function () {
    it("should be parsed from EtcValueNode", function (done) {
        const endpointInfo = createEndpointInfo(etcValueNode);

        assert.equal(endpointInfo.serviceName, "test-service");
        assert.equal(endpointInfo.nodeInfos.length, 1);
        assert.equal(endpointInfo.nodeInfos[0].ip, "127.0.0.1");
        assert.equal(endpointInfo.nodeInfos[0].port, "8080");
        assert.equal(endpointInfo.tls.tlsCert, "test-cert");
        assert.equal(endpointInfo.tls.tlsChain, "test-chain");
        assert.equal(endpointInfo.tls.tlsKey, "test-key");

        done();
    });
});