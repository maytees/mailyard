package main

import (
	"fmt"
	"log"
	"os"
	"runtime"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/services/notifications"

	"mailyard/internal/store"
)

var (
	notifyOnce    sync.Once
	notifySvc     *notifications.NotificationService
	notifyAllowed bool
)

// notifyNewMail posts a desktop notification for fresh inbox mail. macOS only
// shows notifications for bundled apps, so failures (e.g. running the bare
// dev binary) are logged and ignored.
func notifyNewMail(account store.Account, count int, latest store.Message) {
	notifyOnce.Do(func() {
		// UNUserNotificationCenter throws an uncaught NSException (killing the
		// process) when there is no app bundle — i.e. running the bare binary
		// instead of mailyard.app. Never touch the API in that case.
		if runtime.GOOS == "darwin" {
			exe, err := os.Executable()
			if err != nil || !strings.Contains(exe, ".app/Contents/MacOS/") {
				log.Printf("notifications disabled: not running from an app bundle")
				return
			}
		}
		notifySvc = notifications.New()
		allowed, err := notifySvc.RequestNotificationAuthorization()
		if err != nil {
			log.Printf("notifications unavailable: %v", err)
			return
		}
		notifyAllowed = allowed
	})
	if notifySvc == nil || !notifyAllowed {
		return
	}

	title := latest.From.Name
	if title == "" {
		title = latest.From.Email
	}
	body := latest.Subject
	if count > 1 {
		body = fmt.Sprintf("%s (+%d more)", latest.Subject, count-1)
	}
	err := notifySvc.SendNotification(notifications.NotificationOptions{
		ID:       fmt.Sprintf("mail-%d", latest.ID),
		Title:    title,
		Subtitle: account.Email,
		Body:     body,
	})
	if err != nil {
		log.Printf("send notification: %v", err)
	}
}
