package com.maoziscan;

import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;

public class MainActivity extends ReactActivity {

  /**
   * 返回 JS 侧注册的主组件名，需与 app.json 中 name 一致
   */
  @Override
  protected String getMainComponentName() {
    return "MaoziIpScan";
  }

  /**
   * 使用官方 Delegate，便于未来开启 Fabric（新架构）
   */
  @Override
  protected ReactActivityDelegate createReactActivityDelegate() {
    return new DefaultReactActivityDelegate(
        this, getMainComponentName(), DefaultNewArchitectureEntryPoint.fabricEnabled);
  }
}
