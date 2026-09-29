// CTVR-16169 모바일웹: 코인몰 → 코인보석함 명칭 변경 (마이페이지 버튼 → 코인보석함 교환 내역)
const { session, saveLogin, statePath, Q } = require('../../../../lib/web');
const base = process.env.BASE || 'http://127.0.0.1:5101';
const storage = statePath('webmobile');
const deviceName = 'iPhone 13'; // 데스크톱 UA로 열면 웹 도메인으로 넘어가므로 모바일 기기로 연다

(async () => {
  const url = await saveLogin({
    base, loginPath: '/auth/login', deviceName, storage,
    fill: async (p, env) => {
      await p.fill("input[placeholder='이메일 형식의 아이디 입력']", env.CMB_DEV_USER_ID);
      await p.fill('input[type=password]', env.CMB_DEV_USER_PW);
      await p.getByRole('button', { name: '로그인', exact: true }).first().click();
      await p.waitForTimeout(5000);
    },
  });
  console.log('after login:', url.replace(base, ''));
  const s = await session({ app: 'vue-webmobile', ticket: 'CTVR-16169', title: '모바일 코인몰 명칭을 코인보석함으로 변경', base, storage, deviceName });
  const { page, check, result } = s;
  await page.goto(base + '/mypage', { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(5000);
  await check('01-mypage', { screen: '마이페이지 메뉴 버튼', expect: ['코인보석함 교환 내역'], absent: ['코인몰'], full: true });
  await page.getByText('코인보석함 교환 내역', { exact: true }).first().click().catch(e => console.log('click:', e.message.split('\n')[0]));
  await page.waitForTimeout(5000);
  await check('02-prize-history', { screen: '코인보석함 교환 내역 화면', expect: ['코인보석함 교환 내역'], absent: ['코인몰'] });
  result.checks.at(-1).note = `이동한 주소: ${page.url().replace(base, '')} / 탭 제목: ${await page.title()}`;
  result.checks.push({ id: '03-coin-list', screen: '코인보석함 경품 목록 필터 제목 · 구매 모달 안내 문구', shot: null, expect: [], absent: [], verdict: 'info',
    note: "경품 목록 화면(Home.vue)의 '/coin' 라우트가 주석 처리돼 있어 사용자 진입 경로 없음. PrizeFilterDefaultLayout·ProductBuyModal 문구는 코드 diff로만 확인." });
  const r = await s.close();
  console.log('hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);
})();
