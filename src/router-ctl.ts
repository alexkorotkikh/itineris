import * as router from './router';

process.argv.shift();
process.argv.shift();
router.cli(process.argv).subscribe((out) => {
  if (out != '') {
    console.log(out);
  }
}, console.error);
