package main

import (
	"embed"

	"log"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"mailyard/internal/mail"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.
// See https://pkg.go.dev/embed for more information.

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	// Boot handshake: Go announces backend readiness, the frontend announces
	// that its boot gates passed (which triggers the splash → main swap).
	application.RegisterEvent[bool]("backend:ready")
	application.RegisterEvent[bool]("frontend:ready")

	// Fired after any account add/update/remove; the frontend refetches.
	application.RegisterEvent[bool]("accounts:changed")

	// Sync engine → UI: a folder's local mail changed / per-account status.
	application.RegisterEvent[mail.MailChanged]("mail:changed")
	application.RegisterEvent[mail.SyncStatus]("sync:status")
}

// main is the application's entry point: it wires up the Wails app, the
// splash/main window pair, and the boot handshake, then blocks in app.Run.
func main() {

	// 'Services' is the list of Go struct instances whose methods are exposed
	// to the frontend through generated bindings. They share the store opened
	// by BootService during startup.
	boot := &BootService{}
	syncSvc := &SyncService{boot: boot}
	app := application.New(application.Options{
		Name:        "mailyard",
		Description: "A unified AI inbox.",
		Services: []application.Service{
			application.NewService(boot),
			application.NewService(&AccountService{boot: boot}),
			application.NewService(syncSvc),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	// Native splash: a tiny frameless window that paints instantly while the
	// main webview loads. It serves the static splash.html (not the React
	// app — loading "/" here would boot a second app instance).
	// The window itself is transparent; splash.html draws a rounded,
	// theme-aware card inside it, so the visible shape has app-like corners.
	splash := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "splash",
		Width:            420,
		Height:           280,
		MinWidth:         420,
		MinHeight:        280,
		Frameless:        true,
		AlwaysOnTop:      true,
		DisableResize:    true,
		BackgroundType:   application.BackgroundTypeTransparent,
		BackgroundColour: application.NewRGBA(0, 0, 0, 0),
		Mac: application.MacWindow{
			Backdrop: application.MacBackdropTransparent,
		},
		URL: "/splash.html",
	})

	// Create a new window with the necessary options.
	// 'Title' is the title of the window.
	// 'Mac' options tailor the window when running on macOS.
	// 'BackgroundColour' is the background colour of the window.
	// 'URL' is the URL that will be loaded into the webview.
	mainWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:  "main",
		Title: "Mailyard",
		// Window sized to the golden ratio (1000 / 618 ≈ 1.618).
		Width:     1280,
		Height:    791,
		MinWidth:  1000,
		MinHeight: 700,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(6, 7, 15),
		URL:              "/",
		Hidden:           true,
	})

	// Swap splash → main when the frontend's boot gates pass. Once-guarded so
	// the failsafe below and the event can't double-fire. IMAP sync starts
	// here — after reveal, never before — so the app opens instantly offline.
	var revealOnce sync.Once
	reveal := func() {
		revealOnce.Do(func() {
			mainWindow.Show()
			splash.Close()
			go syncSvc.start()
		})
	}

	app.Event.On("frontend:ready", func(event *application.CustomEvent) {
		reveal()
	})

	// Failsafe: a wedged frontend must never leave the user staring at the
	// splash forever.
	go func() {
		time.Sleep(10 * time.Second)
		reveal()
	}()

	// Run the application. This blocks until the application has been exited.
	err := app.Run()

	// If an error occurred while running the application, log it and exit.
	if err != nil {
		log.Fatal(err)
	}
}
