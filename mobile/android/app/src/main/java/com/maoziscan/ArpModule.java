package com.maoziscan;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.InetAddress;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ArpModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;

    public ArpModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @Override
    public String getName() {
        return "ArpModule";
    }

    /**
     * 读取系统 ARP 表
     */
    @ReactMethod
    public void getArpTable(Promise promise) {
        WritableArray result = Arguments.createArray();
        BufferedReader reader = null;

        try {
            reader = new BufferedReader(new FileReader("/proc/net/arp"));
            String line;
            boolean firstLine = true;

            while ((line = reader.readLine()) != null) {
                if (firstLine) {
                    firstLine = false;
                    continue; // 跳过表头
                }

                String[] parts = line.trim().split("\\s+");
                if (parts.length >= 6) {
                    String ip = parts[0];
                    String mac = parts[3];
                    String device = parts[5];

                    // 跳过不完整的条目
                    if (!"00:00:00:00:00:00".equals(mac)) {
                        WritableMap entry = Arguments.createMap();
                        entry.putString("ip", ip);
                        entry.putString("mac", mac);
                        entry.putString("device", device);
                        result.pushMap(entry);
                    }
                }
            }

            promise.resolve(result);
        } catch (IOException e) {
            promise.resolve(result); // 即使失败也返回空数组
        } finally {
            if (reader != null) {
                try {
                    reader.close();
                } catch (IOException e) {
                    // ignore
                }
            }
        }
    }

    /**
     * Ping 单个 IP 地址
     */
    @ReactMethod
    public void ping(String ip, int timeoutMs, Promise promise) {
        new Thread(() -> {
            try {
                InetAddress address = InetAddress.getByName(ip);
                boolean reachable = address.isReachable(timeoutMs);
                promise.resolve(reachable);
            } catch (IOException e) {
                promise.resolve(false);
            }
        }).start();
    }

    /**
     * 使用系统 ping 命令
     */
    @ReactMethod
    public void systemPing(String ip, int count, Promise promise) {
        new Thread(() -> {
            try {
                Process process = Runtime.getRuntime().exec("/system/bin/ping -c " + count + " -W 1 " + ip);
                BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
                StringBuilder output = new StringBuilder();
                String line;

                while ((line = reader.readLine()) != null) {
                    output.append(line).append("\n");
                }

                int exitCode = process.waitFor();
                String result = output.toString();

                WritableMap map = Arguments.createMap();
                map.putBoolean("success", exitCode == 0);
                map.putString("output", result);
                map.putInt("exitCode", exitCode);
                promise.resolve(map);
            } catch (Exception e) {
                WritableMap map = Arguments.createMap();
                map.putBoolean("success", false);
                map.putString("error", e.getMessage());
                promise.resolve(map);
            }
        }).start();
    }

    /**
     * 获取本机 IP 地址和子网信息
     */
    @ReactMethod
    public void getNetworkInfo(Promise promise) {
        try {
            WritableMap map = Arguments.createMap();
            
            // 获取所有网络接口
            java.util.Enumeration<java.net.NetworkInterface> interfaces = 
                java.net.NetworkInterface.getNetworkInterfaces();
            
            while (interfaces.hasMoreElements()) {
                java.net.NetworkInterface iface = interfaces.nextElement();
                if (iface.isLoopback() || !iface.isUp()) continue;
                
                java.util.Enumeration<java.net.InetAddress> addresses = iface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    java.net.InetAddress addr = addresses.nextElement();
                    if (addr instanceof java.net.Inet4Address) {
                        String ip = addr.getHostAddress();
                        if (ip != null && !ip.startsWith("127.")) {
                            map.putString("ipAddress", ip);
                            
                            // 子网掩码
                            int prefixLength = 24; // 默认 /24
                            map.putString("subnet", prefixToNetmask(prefixLength));
                            
                            map.putString("interfaceName", iface.getName());
                            promise.resolve(map);
                            return;
                        }
                    }
                }
            }
            
            promise.resolve(map);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    private String prefixToNetmask(int prefix) {
        int mask = 0xffffffff << (32 - prefix);
        return String.format("%d.%d.%d.%d",
            (mask >> 24) & 0xff,
            (mask >> 16) & 0xff,
            (mask >> 8) & 0xff,
            mask & 0xff);
    }
}
