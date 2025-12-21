
import { Suspense } from "react";
import SettingsContent from "./SettingsContent";

export default function SettingsPage() {
  return (
    <Suspense fallback={<div>Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
