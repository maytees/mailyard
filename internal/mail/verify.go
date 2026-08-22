// Package mail talks to mail servers: connection checks now, the IMAP sync
// engine and SMTP sending in later phases.
package mail

import (
	"context"
	"fmt"

	"github.com/emersion/go-imap/v2/imapclient"
)

// VerifyIMAPLogin dials the server with implicit TLS and attempts a login,
// so bad hosts and bad passwords fail at add-account time instead of during
// the first sync. The context bounds the whole attempt.
func VerifyIMAPLogin(ctx context.Context, host string, port int, username, password string) error {
	done := make(chan error, 1)
	go func() {
		client, err := imapclient.DialTLS(fmt.Sprintf("%s:%d", host, port), nil)
		if err != nil {
			done <- fmt.Errorf("connect to %s: %w", host, err)
			return
		}
		defer client.Close()
		if err := client.Login(username, password).Wait(); err != nil {
			done <- fmt.Errorf("login rejected: %w", err)
			return
		}
		done <- client.Logout().Wait()
	}()

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return fmt.Errorf("connection check timed out: %w", ctx.Err())
	}
}
