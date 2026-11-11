// Feature switches. A feature is off, on for the superuser only (to try it), or on for everyone who is signed in.
// The switch only shows or hides the screen; the data functions behind a feature check the signed-in user themselves.

export type FeatureMode = "off" | "superuser" | "on";

export type FeatureFlag = { key: string; label: string; description: string; mode: FeatureMode };

export const MODE_LABEL: Record<FeatureMode, string> = { off: "Av", superuser: "Bara jag", on: "På för alla" };

export const featureOn = (mode: FeatureMode | undefined, role: "admin" | "superuser" | null): boolean => mode === "on" || (mode === "superuser" && role === "superuser");
