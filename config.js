// Central Config & Version Control
export const SYSTEM_VERSION = "v1.1.01";

// Helper function to auto-update version badges across pages
export function applyVersionBadge(elementId, labelPrefix = "") {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = labelPrefix ? `${labelPrefix} ${SYSTEM_VERSION}` : SYSTEM_VERSION;
    }
}
