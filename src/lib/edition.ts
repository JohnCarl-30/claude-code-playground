// Which edition this build is. The full app runs on your computer: Claude, the
// workspace, examples and challenges. The study site (NEXT_PUBLIC_STUDY_ONLY=1)
// is just the certification track, built as static files with no server, so it
// can be hosted anywhere and shared as a link.

export const APP_NAME = "CCDV-F Study Lab";

/** True in the study-only build. Read at call time, so tests can switch it; Next inlines it at build time. */
export const isStudyOnly = () => process.env.NEXT_PUBLIC_STUDY_ONLY === "1";
