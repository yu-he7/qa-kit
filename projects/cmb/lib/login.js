// CMS·CRM 관리자 로그인(아이디/비밀번호 → 인증번호) 후 storageState 저장. 로그인마다 인증 문자가 발송되므로 세션을 재사용한다.
const fs = require('fs');
const { saveLogin } = require('../../../lib/web');
async function adminLogin(base, storage) {
  return saveLogin({
    base, loginPath: '/auth', viewport: { width: 1600, height: 1000 }, storage, maxAgeMin: 50,
    fill: async (p, env) => {
      await p.fill("input[placeholder='관리자 아이디 입력']", env.CMB_DEV_ADMIN_ID);
      await p.fill("input[placeholder='관리자 비밀번호 입력']", env.CMB_DEV_ADMIN_PW);
      await p.locator('button.button-submit').click(); await p.waitForTimeout(3000);
      await p.fill("input[placeholder='인증번호 입력']", env.CMB_DEV_ADMIN_OTP);
      await p.getByText('인증', { exact: true }).last().click(); await p.waitForTimeout(2500);
      await p.getByRole('button', { name: '확인' }).first().click().catch(() => {}); await p.waitForTimeout(1500);
      if (new URL(p.url()).pathname === '/auth') { await p.locator('button.button-submit').click().catch(() => {}); }
      await p.waitForTimeout(5000);
    },
  });
}
module.exports = { adminLogin };

// 레CTV(webOS 웹앱) 사용자 로그인. webOS 전역 객체를 흉내 내야 앱이 뜬다.
const webosStub = () => { window.webOS = window.webOS || { deviceInfo: cb => cb({ modelName: 'QA' }), platformBack: () => {}, fetchAppId: () => 'qa' }; };
async function ctvLogin(base, storage) {
  return saveLogin({
    base, loginPath: '/', viewport: { width: 1920, height: 1080 }, storage, maxAgeMin: 50, initScripts: [webosStub],
    fill: async (p, env) => {
      await p.waitForTimeout(5000);
      if (!(await p.locator('#id_0_input').count())) return;
      await p.fill('#id_0_input', env.CMB_DEV_USER_ID); await p.fill('#pwd_0_input', env.CMB_DEV_USER_PW);
      await p.click('#login_0'); await p.waitForTimeout(8000);
    },
  });
}
module.exports.ctvLogin = ctvLogin;
module.exports.webosStub = webosStub;

// 레CTV 삼성(Tizen) 실행 흉내. checkVersion.js 의 deviceType 을 'tizen' 으로 로컬 변경한 빌드와 함께 쓴다.
const tizenStub = () => {
  window.tizen = window.tizen || { systeminfo: { getPropertyValue: (n, ok) => ok({ model: 'QA' }) }, application: { getCurrentApplication: () => ({ exit() {}, hide() {} }) }, tvinputdevice: { registerKey() {}, registerKeyBatch() {}, getSupportedKeys: () => [] } };
  window.webapis = window.webapis || { productinfo: { getModel: () => 'QA', getFirmware: () => 'QA' } };
};
module.exports.tizenStub = tizenStub;
