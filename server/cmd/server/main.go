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
	flag.StringVar(&addr, "addr", ":8080", "Server listen address")
	flag.Parse()

	server := api.NewServer(addr)

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
