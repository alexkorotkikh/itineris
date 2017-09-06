import * as cp from 'child_process';
import * as fs from 'fs';

export class EtcdDaemon {
    private etcd: cp.ChildProcess;
    private etcdir: string;

    public static start(): EtcdDaemon {
        let ret = new EtcdDaemon();
        ret.etcdir = fs.mkdtempSync('figo-router-test-');
        console.log('CREATED:', ret.etcdir);
        ret.etcd = cp.spawn('etcd', ['--data-dir', ret.etcdir]);
        ret.etcd.on('error', (err) => {
            console.error("can't spawn etcd");
        });
        return ret;
    }

    public kill(): void {
        console.log('KILL:', this.etcdir);
        this.etcd.kill('SIGTERM');
        cp.spawn('rm', ['-r', this.etcdir]);
    }
}
