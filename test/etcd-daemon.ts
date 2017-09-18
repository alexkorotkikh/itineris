import * as cp from 'child_process';
import * as fs from 'fs';

class EtcdDaemon {
  public etcd: cp.ChildProcess;
  public etcdir: string;

  public static start(): EtcdDaemon {
    let ret = new EtcdDaemon();
    ret.etcdir = fs.mkdtempSync('promise-test-');
    let etcdExec = 'etcd';
    if (fs.existsSync(`${process.env['HOME']}/etcd/etcd`)) {
      etcdExec = `${process.env['HOME']}/etcd/etcd`;
    } else if (fs.existsSync(`${process.env['HOME']}/etcd/bin/etcd`)) {
      etcdExec = `${process.env['HOME']}/etcd/bin/etcd`;
    }
    console.log('CREATED:', ret.etcdir, etcdExec, process.env['HOME']);
    ret.etcd = cp.spawn(etcdExec, ['--data-dir', ret.etcdir]);
    ret.etcd.on('error', (err) => {
      console.error('can\'t spawn etcd');
    });
    ret.etcd.stdin.on('data', (res: string) => {
    // console.log('>>'+res+'<<')
    });
    ret.etcd.stderr.on('data', (res: string) => {
    // console.log('>>'+res+'<<')
    });
    // WAIT FOR started
    return ret;
  }

  public kill(): void {
      console.log('KILL:', this.etcdir);
      this.etcd.kill('SIGTERM');
      cp.spawn('rm', ['-r', this.etcdir]);
  }
}

let etcdDaemon = EtcdDaemon.start();
process.on('exit', etcdDaemon.kill.bind(etcdDaemon));
