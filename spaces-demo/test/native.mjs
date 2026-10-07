// Run via test/compose.sh exec -T spaces-app node --input-type=module - < this file.
// Exercises the PDS directly, bypassing all frontend authorization checks.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createPds, SPACE_TYPE, COLLECTION} from '/demo/pds.mjs';
assert.equal(process.env.SPACES_PDS_HOST, 'spaces-pds.dev.demokratiloftet.no');
const pds = createPds({url:'http://spaces-pds:3000', publicOrigin:'https://' + process.env.SPACES_PDS_HOST});
const prefix = randomBytes(5).toString('hex');
async function account(role) {
  return pds.rpc('com.atproto.server.createAccount', {handle:role + prefix + '.' + process.env.SPACES_PDS_HOST, email:role + prefix + '@example.invalid', password:randomBytes(24).toString('hex')}, null, true);
}
const owner = await account('owner'), member = await account('member');
const {uri:space} = await pds.rpc('com.atproto.simplespace.createSpace', {type:SPACE_TYPE, skey:'native-' + prefix, readPolicy:{$type:'com.atproto.simplespace.defs#memberListPolicy'}, writePolicy:{$type:'com.atproto.simplespace.defs#memberListPolicy'}, appAccess:{$type:'com.atproto.simplespace.defs#open'}}, owner, true);
await pds.rpc('com.atproto.space.createRecord', {space, repo:owner.did, collection:COLLECTION, validate:false, record:{$type:COLLECTION, text:'Synthetic native boundary check', demo:true}}, owner, true);
const params = {space, repo:owner.did, collection:COLLECTION};
assert.deepEqual((await pds.rpc('com.atproto.repo.listRecords', {repo:owner.did, collection:COLLECTION})).records, [], 'Private notice must not appear in ordinary public repo');
await assert.rejects(pds.rpc('com.atproto.space.listRecords', params));
await assert.rejects(pds.credential(member, space), e => e.code === 'UserNotAuthorized');
await pds.rpc('com.atproto.simplespace.putMember', {space, did:member.did, read:true, write:false}, owner, true);
await assert.rejects(pds.rpc('com.atproto.space.listRecords', params, member), e => e.code === 'RepoNotFound', 'Account bearer alone must not read another repo');
const read = await pds.credential(member, space);
assert.equal((await read('com.atproto.space.listRecords', params)).records.length, 1);
await pds.rpc('com.atproto.simplespace.removeMember', {space, did:member.did}, owner, true);
await assert.rejects(pds.credential(member, space), e => e.code === 'UserNotAuthorized');
console.log('PASS native PDS boundary: private records absent from public repo; anonymous, nonmember and unbound bearer reads refused; DPoP member read succeeds; removal blocks renewal.');
