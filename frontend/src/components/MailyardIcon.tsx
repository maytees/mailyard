import type { FC } from 'react';

// interface MailyardIconProps {
// 	size?: number;
// }

const MailyardIcon: FC = () => {
	return (
		<div className="flex items-center justify-center flex-col rounded-md size-12">
			<div className="flex flex-row gap-1">
				<div className="size-2 rounded-full bg-emerald-500/60" />
				<div className="size-2 rounded-full bg-sky-500/60" />
			</div>
			<div className="size-2 mt-1 rounded-full bg-rose-500/60" />
		</div>
	);
};

export default MailyardIcon;
