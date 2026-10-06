// CRM CTVR-16171 코인몰 → 코인보석함 · CTVR-16152 문자 내용 최대 2,000자. 조회·입력만 하고 저장하지 않는다(정지/해제 버튼은 누르지 않음).
// 회원 검색어는 계정 파일의 CMB_DEV_MEMBER_KEYWORD(dev 테스트 회원 이름)를 쓴다.
const { session, statePath, env } = require('../../../../lib/web');
const { adminLogin } = require('../../lib/login');
const base = process.env.BASE || 'http://127.0.0.1:5104';
const storage = statePath('crm');
const viewport = { width: 1600, height: 1000 };
const S2001 = ('가나다라마바사아자차'.repeat(201)).slice(0, 2001);

(async () => {
  await adminLogin(base, storage);
  // CTVR-16171
  let s = await session({ app: 'vue-crm', ticket: 'CTVR-16171', title: 'CRM 코인몰 명칭을 코인보석함으로 변경', base, storage, viewport });
  let { page, check, result } = s;
  const go = async u => { await page.goto(base + u, { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(4000); };
  await go('/member/normal');
  await page.locator("input[placeholder='검색어를 입력해주세요.']").first().fill(env.CMB_DEV_MEMBER_KEYWORD || '');
  await page.getByRole('button', { name: '검색', exact: true }).first().click(); await page.waitForTimeout(5000);
  await page.getByRole('button', { name: '상세', exact: true }).first().click(); await page.waitForTimeout(4000);
  const mbNo = (page.url().match(/detail\/(\d+)/) || [])[1];
  await page.getByText('코인보석함 경품 교환 내역', { exact: true }).first().click().catch(e => console.log('tab:', e.message.split('\n')[0]));
  await page.waitForTimeout(3500);
  await check('01-normal-trade', { screen: '이웃고객 상세 > 코인보석함 경품 교환 내역 탭', expect: ['코인보석함 경품 교환 내역'], absent: ['코인몰 경품 교환 내역'] });
  result.checks.at(-1).note = `이동한 주소: ${page.url().replace(base, '').replace(/detail\/\d+/, 'detail/{회원번호}')}`;

  // dev에 계정 정지 고객이 없어(이름 검색 결과 0건) 같은 회원번호로 정지 고객 상세를 연다. 탭 이름은 템플릿 고정 문구.
  await go(`/member/sleep/detail/${mbNo}`);
  await page.getByText('코인보석함 경품 교환 내역', { exact: true }).first().click().catch(e => console.log('tab:', e.message.split('\n')[0]));
  await page.waitForTimeout(3500);
  await check('02-sleep-trade', { screen: '계정 정지 고객 상세 > 코인보석함 경품 교환 내역 탭', expect: ['코인보석함 경품 교환 내역'], absent: ['코인몰 경품 교환 내역'] });
  result.checks.at(-1).note = 'dev에 계정 정지 고객이 없어 일반 회원번호로 상세 화면을 열어 탭 이름만 확인(데이터 무관). 회원을 정지시키지 않음.';
  let r = await s.close();
  console.log('16171 hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);

  // CTVR-16152
  s = await session({ app: 'vue-crm', ticket: 'CTVR-16152', title: '프로모션·문자캠페인 문자 내용 최대 2,000자 입력 제한', base, storage, viewport });
  ({ page, check, result } = s);
  page.on('dialog', d => { console.log('dialog:', d.type(), d.message().slice(0, 60)); d.accept().catch(() => {}); });
  async function type2001(ta) {
    await ta.waitFor({ state: 'visible', timeout: 60000 }); await ta.scrollIntoViewIfNeeded();
    await ta.fill(S2001.slice(0, 1995)); await ta.click(); await page.keyboard.press('End');
    await page.keyboard.type(S2001.slice(1995), { delay: 30 }); await page.waitForTimeout(800);
    const len = await ta.evaluate(e => e.value.length);
    const counter = await ta.evaluate(e => (e.closest('.el-textarea')?.querySelector('.el-input__count')?.innerText || '').trim());
    await ta.blur(); await page.waitForTimeout(800);
    return { len, counter };
  }
  const judge = (id, v) => { const c = result.checks.at(-1); c.expect.push({ text: `입력값 2000자(실제 ${v.len})`, ok: v.len === 2000 }, { text: `글자 수 '2000 / 2000'(실제 '${v.counter}')`, ok: /2000\s*\/\s*2000/.test(v.counter) }); c.verdict = c.expect.every(x => x.ok) ? 'pass' : 'fail'; console.log(id, c.verdict, JSON.stringify(v)); };

  await go('/campaign/management/sms/create');
  let v = await type2001(page.locator('textarea').first());
  await check('01-campaign-sms', { screen: '캠페인 자동화 > 문자 등록: 내용에 2,001자 입력', expect: [] });
  judge('campaign', v);
  result.checks.at(-1).note = '저장하지 않음.';

  for (const [n, kind, label] of [['02', 'gold', '골드 코인프로모션 등록'], ['03', 'product', '상품프로모션 등록']]) {
    await go(`/policy/promotions/${kind}/create`);
    await page.getByText('맞춤', { exact: true }).first().click({ timeout: 60000 }); await page.waitForTimeout(1500);
    const sms = page.locator('label.el-checkbox').filter({ hasText: /^\s*문자\s*$/ }).first();
    console.log('sms checkbox:', await sms.count(), 'checked:', await sms.evaluate(e => e.classList.contains('is-checked')).catch(() => 'n/a'));
    if (!(await sms.evaluate(e => e.classList.contains('is-checked')))) await sms.click();
    await page.waitForTimeout(1500);
    const ta = page.locator('textarea[maxlength="2000"]').first(); console.log('sms textareas:', await page.locator('textarea[maxlength="2000"]').count(), 'all:', await page.locator('textarea').evaluateAll(t => t.map(e => e.maxLength)));
    v = await type2001(ta);
    await check(`${n}-promotions-${kind}`, { screen: `프로모션 > ${label} > 맞춤 · 문자 > 문자 내용에 2,001자 입력`, expect: [] });
    judge(kind, v);
    result.checks.at(-1).note = "이전 제한 300자 → 2,000자. 입력창이 2,000자에서 막혀 '문자 내용은 최대 2,000자까지 입력할 수 있습니다.' 검증 문구는 화면에서 띄울 수 없음(코드로 확인). 저장하지 않음.";
  }
  r = await s.close();
  console.log('16152 hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);
})();
