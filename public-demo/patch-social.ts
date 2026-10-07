import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
const root = process.argv[2];
if (!root) throw new Error("Source directory required");
function edit(file: string, from: string, to: string) {
  const p = root + "/" + file,
    s = readFileSync(p, "utf8");
  if (s.split(from).length !== 2)
    throw new Error("Pinned social source changed: " + file + " " + from);
  writeFileSync(p, s.replace(from, to));
}
edit(
  "src/lib/constants.ts",
  "export const BSKY_SERVICE = 'https://bsky.social'",
  "export const BSKY_SERVICE = 'https://' + process.env.EXPO_PUBLIC_LOCAL_PDS",
);
edit(
  "src/state/session/agent.ts",
  "  constructor({service}: {service: string}) {",
  `  constructor({service}: {service: string}) {
    if (new URL(service).origin !== 'https://' + process.env.EXPO_PUBLIC_LOCAL_PDS) throw new Error('Use an account on this demo server');`,
);
edit(
  "index.web.js",
  "import '#/platform/markBundleStartTime'",
  "import './private-runtime'\nimport '#/platform/markBundleStartTime'",
);
edit(
  "src/view/com/composer/Composer.tsx",
  "allowedAssetTypes={selectedAssetsType}",
  "allowedAssetTypes={'image'}",
);
edit(
  "src/view/com/composer/Composer.tsx",
  "<SelectGifBtn onSelectGif={onSelectGif} disabled={!!media} />",
  "{/* External GIF service is intentionally unavailable in this demo. */}",
);
copyFileSync("/tmp/browser-runtime.ts", root + "/private-runtime.ts");

// A closed demo has exactly one account provider.
writeFileSync(
  root + "/src/components/forms/HostingProvider.tsx",
  `import React from 'react'
import {Text} from '#/components/Typography'
export function HostingProvider({serviceUrl}: {serviceUrl: string; onSelectServiceUrl: (provider: string) => void; onOpenDialog?: () => void; minimal?: boolean}) {
  return <Text>Demo accounts: {new URL(serviceUrl).hostname}</Text>
}
`,
);

edit(
  "src/state/session/agent.ts",
  "    handle,\n    inviteCode,\n    verificationPhone,\n    verificationCode,\n  })",
  "    handle,\n  })",
);
// Skip public-network recommendations during demo onboarding.
edit(
  "src/screens/Onboarding/state.ts",
  "    case 'next': {",
  "    case 'next': {\n      if (s.activeStep === 'profile') return {...s, activeStep:'finished', activeStepIndex:2, totalSteps:2}",
);
edit(
  "src/screens/Onboarding/StepFinished.tsx",
  "          BSKY_APP_ACCOUNT_DID,",
  "          // No automatic follows of public-network accounts.",
);
edit(
  "src/view/shell/desktop/LeftNav.tsx",
  "          <ChatNavItem />",
  "          {/* External chat is unavailable in this demo. */}",
);
edit(
  "src/view/shell/Drawer.tsx",
  "            <ChatMenuItem isActive={isAtMessages} onPress={onPressMessages} />",
  "            {/* External chat is unavailable in this demo. */}",
);
const bottom = "src/view/shell/bottom-bar/BottomBarWeb.tsx";
const source = readFileSync(root + "/" + bottom, "utf8");
const chat = source.match(
  /<NavItem\s+routeName="Messages"[\s\S]*?<\/NavItem>/g,
);
if (chat?.length !== 1) throw new Error("Pinned chat navigation changed");
edit(bottom, chat[0], "{/* External chat is unavailable in this demo. */}");
edit(
  "src/state/queries/messages/list-conversations.tsx",
  "  if (!hasSession) {",
  "  if (process.env.EXPO_PUBLIC_LOCAL_PDS || !hasSession) {",
);
edit(
  "src/state/messages/events/index.tsx",
  "  if (!currentAccount) {",
  "  if (process.env.EXPO_PUBLIC_LOCAL_PDS || !currentAccount) {",
);

edit(
  "src/screens/Onboarding/index.tsx",
  "  const showValueProp = ENV !== 'e2e' && gate('onboarding_value_prop')",
  "  const showValueProp = false",
);
edit(
  "src/screens/Onboarding/StepFinished.tsx",
  "We hope you have a wonderful time. Remember, Bluesky is:",
  "Welcome to the Loftet demo:",
);
edit(
  "src/screens/Onboarding/StepFinished.tsx",
  "<Trans>Public</Trans>",
  "<Trans>Shared demo</Trans>",
);
edit(
  "src/screens/Onboarding/StepFinished.tsx",
  "Your posts, likes, and blocks are public. Mutes are private.",
  "Anyone can read and copy demo posts and images without signing in.",
);
edit(
  "src/screens/Onboarding/StepFinished.tsx",
  "<Trans>Open</Trans>",
  "<Trans>Local accounts</Trans>",
);
edit(
  "src/screens/Onboarding/StepFinished.tsx",
  "Never lose access to your followers or data.",
  "Posts are hosted here with public federation disabled.",
);
edit(
  "src/screens/Onboarding/StepFinished.tsx",
  "Choose the algorithms that power your custom feeds.",
  "Try posts, images and the calendar with synthetic demo data.",
);

for (const action of ["logoutCurrentAccount", "logoutEveryAccount"]) {
  edit(
    "src/state/session/index.tsx",
    "SessionApiContext['" + action + "']\n  >(\n    logContext => {",
    "SessionApiContext['" +
      action +
      "']\n  >(\n    async logContext => {\n      const result = await fetch('https://' + process.env.EXPO_PUBLIC_LOCAL_PDS + '/demo/logout', {method:'POST'})\n      if (!result.ok) throw new Error('Could not end demo media session; please retry')",
  );
}
// These deployment-specific notices are plain text, not missing upstream i18n IDs.
for (const notice of [
  "Welcome to the Loftet demo:",
  "Shared demo",
  "Anyone can read and copy demo posts and images without signing in.",
  "Local accounts",
  "Posts are hosted here with public federation disabled.",
  "Try posts, images and the calendar with synthetic demo data.",
]) {
  const file = "src/screens/Onboarding/StepFinished.tsx";
  const text = readFileSync(root + "/" + file, "utf8");
  const escaped = notice.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = text.match(
    new RegExp("<Trans>\\s*" + escaped + "\\s*</Trans>", "g"),
  );
  if (matches?.length !== 1) throw new Error("Demo notice patch failed");
  edit(file, matches[0], notice);
}
