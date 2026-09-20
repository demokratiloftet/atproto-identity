import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HandleProvisioner,IdentityGateway} from '@loftet/identity';

const adapter={validate(){},async create({handle}){return {did:'did:plc:fixture',handle};}};
const make=()=>new HandleProvisioner({namespaces:[
  {domain:'idrett.devotta.no',providers:['idrett'],adapter},
  {domain:'demokratiloftet.no',providers:['idrett','community'],adapter},
]});
test('public package exposes gateway; domain choices follow verified provider',async()=>{
  assert.equal(typeof IdentityGateway,'function');
  const p=make();
  assert.equal(p.choices({provider:'idrett'}).length,2);
  assert.deepEqual(p.choices({provider:'community'}),[{domain:'demokratiloftet.no'}]);
  assert.deepEqual(p.choices({provider:'unknown'}),[]);
  await assert.rejects(()=>p.create({handle:'edvin.idrett.devotta.no',provider:'idrett'},{provider:'community'}));
  assert.equal((await p.create({handle:'Edvin.Demokratiloftet.no'},{provider:'community'})).handle,'edvin.demokratiloftet.no');
});
test('rejects reserved names, nested names, domain suffix spoofing and malformed handles',()=>{
  const p=make();
  for(const handle of ['admin.demokratiloftet.no','a.b.demokratiloftet.no','edvin.demokratiloftet.no.evil.no','edvin.evil-demokratiloftet.no','-edvin.demokratiloftet.no','edvin-.demokratiloftet.no','ed vin.demokratiloftet.no','edvin.demokratiloftet.no.',null]){
    assert.throws(()=>p.validate({handle},{provider:'community'}),String(handle));
  }
  for(const s of p.suggest({provider:'idrett'}))p.validate(s,{provider:'idrett'});
});
test('test namespaces are opt-in; namespace configuration fails closed',()=>{
  for(const domain of ['test','org.test','org.local','devotta','org.123','org..no']){
    assert.throws(()=>new HandleProvisioner({namespaces:[{domain,providers:['org'],adapter}]}));
  }
  const p=new HandleProvisioner({allowTest:true,namespaces:[{domain:'test',providers:['demo'],adapter}]});
  p.validate({handle:'enroll-abc.test'},{provider:'demo'});
  assert.throws(()=>new HandleProvisioner({namespaces:[{domain:'devotta.no',providers:[],adapter}]}));
});
