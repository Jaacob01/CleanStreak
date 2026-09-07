/**
 * Tab 页滚动内容末尾垫片
 * 用 react-native-screens 的 SafeAreaView：它测量的是最近原生容器（RNSTabsScreen）
 * 的真实安全区，iOS 26 悬浮 Liquid Glass tab 栏的遮挡包含在内，高度由系统算出，
 * 不依赖写死数值（原生 UITabBarController 高度 JS 侧无法直接获取）。
 * Web 上退化为普通 View（JS 版 tab 栏在文档流内，本就不遮挡内容）。
 */
import { SafeAreaView } from 'react-native-screens/src/components/safe-area';

export function TabBarSpacer({ extra = 12 }: { extra?: number }) {
  // 屏蔽底层组件注入的 flex: 1：作为垫片必须恒定占位（原生下边距 + extra），
  // 否则在与 flex:1 兄弟节点同处一个固定高度纵向容器时会平分剩余空间，
  // 把贴底 UI（如聊天输入坞）顶到屏幕中间。
  return (
    <SafeAreaView
      edges={{ top: false, bottom: true, left: false, right: false }}
      style={{ flexGrow: 0, flexShrink: 0, flexBasis: 'auto', height: extra }}
    />
  );
}
