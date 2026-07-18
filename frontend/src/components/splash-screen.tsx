import { AnimatePresence, motion } from "motion/react"
import * as React from "react"

import { runBootstrap } from "@/lib/bootstrap"

/**
 * Holds the app behind the splash until every boot gate resolves, then
 * cross-fades: the app mounts as the splash animates out.
 */
export function SplashGate({ children }: { children: React.ReactNode }) {
	const [ready, setReady] = React.useState(false)

	React.useEffect(() => {
		let cancelled = false
		runBootstrap().finally(() => {
			if (!cancelled) setReady(true)
		})
		return () => {
			cancelled = true
		}
	}, [])

	return (
		<>
			{ready && children}
			<AnimatePresence>{!ready && <SplashScreen />}</AnimatePresence>
		</>
	)
}

function SplashScreen() {
	return (
		<motion.div
			className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-10 bg-background"
			exit={{ opacity: 0, scale: 1.04 }}
			transition={{ duration: 0.35, ease: "easeInOut" }}
		>
			<motion.img
				src="/logo.svg"
				alt="Mailyard"
				className="size-24 dark:opacity-80"
				initial={{ opacity: 0, scale: 0.7, y: 12 }}
				animate={{ opacity: 1, scale: 1, y: 0 }}
				transition={{ type: "spring", stiffness: 200, damping: 18 }}
			/>
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: 0.25, duration: 0.3 }}
			>
				<LoaderDots />
			</motion.div>
		</motion.div>
	)
}

function LoaderDots() {
	return (
		<div className="flex gap-2" role="status" aria-label="Loading Mailyard">
			{[0, 1, 2].map((i) => (
				<motion.span
					key={i}
					className="size-1.5 rounded-full bg-muted-foreground/70"
					animate={{ opacity: [0.25, 1, 0.25], scale: [1, 1.25, 1] }}
					transition={{
						duration: 1.2,
						repeat: Infinity,
						delay: i * 0.15,
						ease: "easeInOut",
					}}
				/>
			))}
		</div>
	)
}
