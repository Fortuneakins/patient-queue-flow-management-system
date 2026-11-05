const test = require('node:test');
const assert = require('node:assert/strict');
const dbConfigured = Boolean(process.env.RUN_DB_TESTS && process.env.DB_NAME);
if (!dbConfigured) {
  test('operational action register integration suite requires RUN_DB_TESTS=1 and PostgreSQL', { skip:true }, () => {});
} else {
  process.env.JWT_SECRET ||= 'integration-test-secret-with-at-least-32-characters-123';
  process.env.INTERNAL_SERVICE_TOKEN ||= 'integration-internal-token';
  process.env.NODE_ENV ||= 'test';
  process.env.DATA_PROVENANCE_MODE ||= 'SYNTHETIC_TEST';
  process.env.SMS_ENABLED='false';
  const { httpServer }=require('../../src/app');
  const { query,pool }=require('../../src/db/pool');
  let baseUrl, listening=false;
  const actionIds=[];
  async function request(path,options={}) {
    const headers={'Content-Type':'application/json',...(options.headers||{})};
    const response=await fetch(baseUrl+path,{...options,headers});
    const body=(response.headers.get('content-type')||'').includes('application/json')?await response.json():null;
    return {response,body};
  }
  const auth=token=>({Authorization:'Bearer '+token});
  async function login(username) {
    const result=await request('/api/auth/login',{method:'POST',body:JSON.stringify({username,password:'DemoPass2026!'})});
    assert.equal(result.response.status,200,'test login failed for '+username);
    return result.body;
  }
  test.before(async()=>{
    await new Promise(resolve=>httpServer.listen(0,'127.0.0.1',resolve));
    listening=true; baseUrl='http://127.0.0.1:'+httpServer.address().port;
  });
  test.after(async()=>{
    for(const id of actionIds) await query('DELETE FROM clinic_action_items WHERE action_id=$1',[id]);
    if(listening) await new Promise(resolve=>httpServer.close(resolve));
    await pool.end();
  });
  test('administrator can create, assign and close actions while other roles are denied',async()=>{
    const anonymous=await request('/api/intelligence/actions');
    assert.equal(anonymous.response.status,401);
    const admin=await login('admin_demo'), nurse=await login('nurse_demo');
    const denied=await request('/api/intelligence/actions',{headers:auth(nurse.token)});
    assert.equal(denied.response.status,403);
    const nurseCreate=await request('/api/intelligence/actions/from-insight',{method:'POST',headers:auth(nurse.token),body:JSON.stringify({rule_id:'MODEL-001'})});
    assert.equal(nurseCreate.response.status,403);
    const overview=await request('/api/intelligence/overview',{headers:auth(admin.token)});
    assert.equal(overview.response.status,200);
    assert.ok(overview.body.insights.length>0);
    const ruleId=overview.body.insights[0].rule_id;
    const created=await request('/api/intelligence/actions/from-insight',{method:'POST',headers:auth(admin.token),body:JSON.stringify({rule_id:ruleId})});
    assert.equal(created.response.status,201,JSON.stringify(created.body));
    const id=created.body.action_id; actionIds.push(id);
    assert.equal(created.body.status,'OPEN');
    assert.equal(created.body.source_rule_id,ruleId);
    assert.ok(Array.isArray(created.body.evidence));
    const duplicate=await request('/api/intelligence/actions/from-insight',{method:'POST',headers:auth(admin.token),body:JSON.stringify({rule_id:ruleId})});
    assert.equal(duplicate.response.status,200);
    assert.equal(duplicate.body.action_id,id);
    assert.equal(duplicate.body.already_open,true);
    const staff=await request('/api/staff',{headers:auth(admin.token)});
    assert.equal(staff.response.status,200);
    const nurseOwner=staff.body.find(person=>person.role==='NURSE'&&person.is_active);
    assert.ok(nurseOwner);
    const assigned=await request('/api/intelligence/actions/'+id,{method:'PATCH',headers:auth(admin.token),body:JSON.stringify({owner_staff_id:nurseOwner.staff_id})});
    assert.equal(assigned.response.status,200,JSON.stringify(assigned.body));
    assert.equal(Number(assigned.body.owner_staff_id),Number(nurseOwner.staff_id));
    for(const status of ['ACKNOWLEDGED','IN_PROGRESS','RESOLVED']){
      const updated=await request('/api/intelligence/actions/'+id,{method:'PATCH',headers:auth(admin.token),body:JSON.stringify({status})});
      assert.equal(updated.response.status,200,JSON.stringify(updated.body));
      assert.equal(updated.body.status,status);
    }
    const reopen=await request('/api/intelligence/actions/'+id,{method:'PATCH',headers:auth(admin.token),body:JSON.stringify({status:'OPEN'})});
    assert.equal(reopen.response.status,409);
    const events=await request('/api/intelligence/events?event_type=OPERATIONAL_ACTION_CREATED&limit=20',{headers:auth(admin.token)});
    assert.equal(events.response.status,200);
    assert.ok(events.body.some(event=>Number(event.entity_id)===Number(id)));
  });
}
