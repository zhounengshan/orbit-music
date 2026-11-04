# 随我听

随我听的手机浏览器版。与 iPhone App 1.4.0 共用界面和主要播放交互。

## 在线使用

https://zhounengshan.github.io/orbit-music/

支持歌曲搜索、歌手曲库入口、播放与同步歌词、收藏、播放队列、歌单和搜索历史。页面可添加到手机主屏幕。

网页由 GitHub Pages 托管。搜索与播放请求使用独立公开 API；音频由对应资源地址提供。收藏、歌单和搜索历史保存在当前浏览器的本地存储，不会自动跨设备同步。

网盘连接依赖 iPhone App 的本地安全组件，因此浏览器版会提示在 App 中使用网盘。浏览器版不收集网盘账号或密码。

## 项目文件

根目录的 `index.html`、`styles.css`、`app.js`、`sw.js`、`manifest.webmanifest` 和 `assets/` 是当前网页版本。推送到 `main` 后，GitHub Actions 将发布到 GitHub Pages。
