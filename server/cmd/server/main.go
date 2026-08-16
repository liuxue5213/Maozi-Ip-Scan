package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"maozi-scan/internal/api"
)

func main() {
	var addr string
	var webDir string
	var historyFile string
	flag.StringVar(&addr, "addr", ":8080", "Server listen address")
	// 默认值按「从 server/ 目录运行」取 ../web/dist；也可指向绝对路径
	flag.StringVar(&webDir, "web", "../web/dist", "Frontend static files directory")
	// 历史持久化文件（空则只存内存，重启丢失）
	flag.StringVar(&historyFile, "history", "data/history.json", "Scan history file path")
	flag.Parse()

	server := api.NewServer(addr, webDir, historyFile)

	// 优雅关闭
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("Shutting down server...")
		os.Exit(0)
	}()

	log.Printf("🐱 Maozi-Ip-Scan server starting...")
	log.Printf("   API: http://localhost%s", addr)
	log.Printf("   Web UI: http://localhost%s", addr)

	if err := server.Start(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
