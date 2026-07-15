/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: "com.personal.next",
  appName: "Next个人执行系统",
  webDir: "dist",
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

module.exports = config;
