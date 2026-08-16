package scanner

import (
	"context"
	"os/exec"
	"runtime"
	"time"
)

// Ping 使用系统 ping 命令探测主机（无需 root 权限）。
// 原始套接字（ip4:icmp）在 macOS/Linux 上需要 root，
// 而系统 ping 在 macOS 上是 setuid、在 Linux 上走 ping socket，普通用户可用。
func Ping(ip string, timeout time.Duration) bool {
	if timeout <= 0 {
		timeout = 2 * time.Second
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "ping", "-n", "1", "-w", "2000", ip)
	} else {
		cmd = exec.CommandContext(ctx, "ping", "-c", "1", ip)
	}

	err := cmd.Run()
	// 退出码 0 表示收到应答；超时被 context 杀掉也视为不可达
	return err == nil
}
