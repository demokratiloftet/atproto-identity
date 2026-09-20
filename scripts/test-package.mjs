// Install outside this workspace: catches accidental source-tree dependencies.
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
execFileSync(process.execPath,['scripts/pack.mjs'],{cwd:root,stdio:'inherit'});
const consumer=mkdtempSync(join(tmpdir(),'identity-consumer-'));
try {
  writeFileSync(join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
  const packages=['auth','identity'].map(name=>{
    const {version}=JSON.parse(readFileSync(join(root,'packages',name,'package.json')));
    return join(root,'dist',`loftet-${name}-${version}.tgz`);
  });
  execFileSync('npm',['install','--ignore-scripts','--no-audit','--no-fund',...packages],{cwd:consumer,stdio:'inherit'});
  execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import {AuthStore, AuthService, OidcProvider, createAtprotoProvider, restrictedFetch} from '@loftet/auth';
    import {IdentityGateway, HandleProvisioner} from '@loftet/identity';
    import {sandboxPdsProvisioner} from '@loftet/identity/sandbox';
    for (const value of [AuthStore,AuthService,OidcProvider,createAtprotoProvider,restrictedFetch,IdentityGateway,HandleProvisioner]) assert.equal(typeof value,'function');
    const handles=new HandleProvisioner({allowTest:true,namespaces:[{domain:'test',providers:['demo'],adapter:sandboxPdsProvisioner()}]});
    assert.equal(handles.choices({provider:'demo'})[0].domain,'test');
    console.log('PASS independent consumer imports packed packages without calendar or workspace source');
  `],{cwd:consumer,stdio:'inherit'});
} finally {
  rmSync(consumer,{recursive:true,force:true});
}
