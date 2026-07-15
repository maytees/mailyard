import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GreetService } from "@/bindings/changeme";

export function App() {
	const [greetState, setGreetState] = useState("No greet state!")

	useEffect(() => {
		const f = async () => {
			const recieved = await GreetService.Greet("World");
			setGreetState(recieved)
		};
		f();
	}, []);

	return (
		<div className="flex min-h-svh px-6 pb-6 pt-14">
			<div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
				<div>
					<h1 className="font-medium">Project ready!</h1>
					<p>You may now add components and start building.</p>
					<p>We&apos;ve already added the button component for you.</p>
					<Button className="mt-2">Button</Button>
				</div>
				<div className="font-mono text-xs text-muted-foreground">
					(Press <kbd>d</kbd> to toggle dark mode)
				</div>

				<p>Greet state: {greetState}</p>
			</div>
		</div>
	);
}

export default App;
