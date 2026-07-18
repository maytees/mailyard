package main

import (
	"embed"

	"log"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.
// See https://pkg.go.dev/embed for more information.

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	// Register a custom event whose associated data type is string.
	// This is not required, but the binding generator will pick up registered events
	// and provide a strongly typed JS/TS API for them.
	application.RegisterEvent[string]("time")

	// Boot handshake: Go announces backend readiness, the frontend announces
	// that its boot gates passed (which triggers the splash → main swap).
	application.RegisterEvent[bool]("backend:ready")
	application.RegisterEvent[bool]("frontend:ready")
}

// main function serves as the application's entry point. It initializes the application, creates a window,
// and starts a goroutine that emits a time-based event every second. It subsequently runs the application and
// logs any error that might occur.
func main() {

	// Create a new Wails application by providing the necessary options.
	// Variables 'Name' and 'Description' are for application metadata.
	// 'Assets' configures the asset server with the 'FS' variable pointing to the frontend files.
	// 'Bind' is a list of Go struct instances. The frontend has access to the methods of these instances.
	// 'Mac' options tailor the application when running an macOS.
	app := application.New(application.Options{
		Name:        "mailyard",
		Description: "A unified AI inbox.",
		Services: []application.Service{
			application.NewService(&GreetService{}),
			application.NewService(&BootService{}),
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
		Frameless:        true,
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
		Width:  1280,
		Height: 791,
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
	// the failsafe below and the event can't double-fire.
	var revealOnce sync.Once
	reveal := func() {
		revealOnce.Do(func() {
			mainWindow.Show()
			splash.Close()
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

	// Create a goroutine that emits an event containing the current time every second.
	// The frontend can listen to this event and update the UI accordingly.
	go func() {
		for {
			now := time.Now().Format(time.RFC1123)
			app.Event.Emit("time", now)
			time.Sleep(time.Second)
		}
	}()

	// Run the application. This blocks until the application has been exited.
	err := app.Run()

	// If an error occurred while running the application, log it and exit.
	if err != nil {
		log.Fatal(err)
	}
}
