import { TldrawUiIcon, type TLUiIconType } from 'tldraw'

export type WorkbenchDomainIconName =
	| 'architecture'
	| 'ml'
	| 'uiux'
	| 'product'

const NATIVE_DOMAIN_ICONS: Partial<
	Record<WorkbenchDomainIconName, TLUiIconType>
> = {
	architecture: 'share-1',
	product: 'geo-check-box',
}

interface WorkbenchDomainIconProps {
	name: WorkbenchDomainIconName
	small?: boolean
}

/**
 * Domain glyphs use tldraw's monochrome visual language. ML and UI/UX need
 * purpose-built silhouettes because the closest stock glyphs read as a curve
 * and a frame corner at toolbar size.
 */
export function WorkbenchDomainIcon({
	name,
	small = false,
}: WorkbenchDomainIconProps) {
	const nativeIcon = NATIVE_DOMAIN_ICONS[name]
	if (nativeIcon) {
		return <TldrawUiIcon icon={nativeIcon} label="" small={small} />
	}

	return (
		<svg
			className="workbench-domain-glyph"
			data-domain-icon={name}
			viewBox="0 0 24 24"
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{name === 'ml' && (
				<>
					<circle cx="4.5" cy="7" r="1.6" />
					<circle cx="4.5" cy="17" r="1.6" />
					<circle cx="12" cy="12" r="2.2" />
					<circle cx="19.5" cy="7" r="1.6" />
					<circle cx="19.5" cy="17" r="1.6" />
					<path d="m6 7.7 4.1 3M6 16.3l4.1-3M13.9 10.8l4.1-3M13.9 13.2l4.1 3" />
				</>
			)}
			{name === 'uiux' && (
				<>
					<rect x="2.5" y="3.5" width="19" height="17" rx="2" />
					<path d="M2.5 8h19M8 8v12.5" />
					<path d="M11.5 11.5h6.5M11.5 15h4.5" />
					<circle cx="5.2" cy="5.8" r=".55" fill="currentColor" stroke="none" />
				</>
			)}
		</svg>
	)
}
