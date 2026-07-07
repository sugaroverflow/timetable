"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ImageUploadField } from "@/components/ImageUploadField";
import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";
import {
  FONT_PAIRINGS,
  themeVars,
  type DigestSettings,
  type ThemeSettings,
} from "@/lib/timetableSettings";

const MUTATION = `mutation Theme($s: String!, $theme: String, $cover: String, $icon: String) {
  updateTimetableSettings(
    idOrSlug: $s
    themeJson: $theme
    coverImageUrl: $cover
    iconUrl: $icon
  ) { id }
}`;

export type SettingsValues = {
  roleLabels?: { admin?: string; host?: string; elector?: string };
  theme?: ThemeSettings;
  coverImageUrl?: string | null;
  iconUrl?: string | null;
  digestDefaults?: DigestSettings;
};

function applyPreview(theme: ThemeSettings) {
  // The timetable shell (<main>) carries inline CSS vars that shadow the
  // theme <style> tag — write the preview where it wins. Preview reflects
  // the viewer's current light/dark mode.
  const mode =
    document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const target =
    document.querySelector<HTMLElement>("main.container") ??
    document.documentElement;
  // Clear earlier previews so removed values fall back to the stylesheet.
  for (const name of Array.from(target.style)) {
    if (name.startsWith("--")) target.style.removeProperty(name);
  }
  for (const [name, value] of Object.entries(themeVars(theme, mode))) {
    target.style.setProperty(name, value);
  }
}

const DARK_DEFAULTS = {
  background: "#14171e",
  topbar: "#1d222c",
  text: "#e7eaf1",
};

/** Theme section of Settings (QA #59): every base colour, an optional dark
 * palette, font pairing, cover image, and icon — with live preview. */
export function SettingsForm({
  slug,
  current,
}: {
  slug: string;
  current: SettingsValues;
}) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Single source for both the initial state and what Discard restores.
  const initial = {
    primary: current.theme?.primary ?? "#2f54eb",
    secondary: current.theme?.secondary ?? "#5b7bff",
    background: current.theme?.background ?? "#eceef3",
    topbar: current.theme?.topbar ?? "#ffffff",
    text: current.theme?.text ?? "#1b2330",
    font: current.theme?.font ?? "default",
    darkBackground: current.theme?.dark?.background ?? DARK_DEFAULTS.background,
    darkTopbar: current.theme?.dark?.topbar ?? DARK_DEFAULTS.topbar,
    darkText: current.theme?.dark?.text ?? DARK_DEFAULTS.text,
    cover: current.coverImageUrl ?? "",
    icon: current.iconUrl ?? "",
  };

  const [primary, setPrimary] = useState(initial.primary);
  const [secondary, setSecondary] = useState(initial.secondary);
  const [background, setBackground] = useState(initial.background);
  const [topbar, setTopbar] = useState(initial.topbar);
  const [text, setText] = useState(initial.text);
  const [font, setFont] = useState(initial.font);
  const [darkBackground, setDarkBackground] = useState(initial.darkBackground);
  const [darkTopbar, setDarkTopbar] = useState(initial.darkTopbar);
  const [darkText, setDarkText] = useState(initial.darkText);
  const [cover, setCover] = useState(initial.cover);
  const [icon, setIcon] = useState(initial.icon);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  type State = typeof initial;

  function toTheme(state: State): ThemeSettings {
    return {
      primary: state.primary,
      secondary: state.secondary,
      background: state.background,
      topbar: state.topbar,
      text: state.text,
      font: state.font,
      dark: {
        background: state.darkBackground,
        topbar: state.darkTopbar,
        text: state.darkText,
      },
    };
  }

  function currentState(): State {
    return {
      primary,
      secondary,
      background,
      topbar,
      text,
      font,
      darkBackground,
      darkTopbar,
      darkText,
      cover,
      icon,
    };
  }

  function preview(patch: Partial<State>) {
    applyPreview(toTheme({ ...currentState(), ...patch }));
  }

  function discard() {
    setPrimary(initial.primary);
    setSecondary(initial.secondary);
    setBackground(initial.background);
    setTopbar(initial.topbar);
    setText(initial.text);
    setFont(initial.font);
    setDarkBackground(initial.darkBackground);
    setDarkTopbar(initial.darkTopbar);
    setDarkText(initial.darkText);
    setCover(initial.cover);
    setIcon(initial.icon);
    applyPreview(toTheme(initial));
    setSaved(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    try {
      await clientGql(MUTATION, {
        s: slug,
        theme: JSON.stringify(toTheme(currentState())),
        cover: cover.trim() || null,
        icon: icon.trim() || null,
      });
      setSaved(true);
      toast("Theme saved");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not save theme");
    }
  }

  const colourField = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    previewKey: keyof State,
  ) => (
    <div className="field" style={{ marginBottom: 0 }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="color"
        value={value}
        onChange={(e) => {
          set(e.target.value);
          preview({ [previewKey]: e.target.value });
        }}
        style={{ width: 64, padding: 2, height: 38 }}
      />
    </div>
  );

  return (
    <form onSubmit={submit} className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Theme</h2>
      <p className="faint" style={{ marginTop: 0, fontSize: 12 }}>
        Colours preview live — Save to keep them, Discard to revert.
      </p>

      <div className="row wrap">
        {colourField("tp", "Primary", primary, setPrimary, "primary")}
        {colourField("ts", "Secondary", secondary, setSecondary, "secondary")}
        {colourField("tb", "Background", background, setBackground, "background")}
        {colourField("tt", "Top bar", topbar, setTopbar, "topbar")}
        {colourField("tx", "Text", text, setText, "text")}
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="tf">Fonts</label>
        <select
          id="tf"
          value={font}
          onChange={(e) => {
            setFont(e.target.value);
            preview({ font: e.target.value });
          }}
        >
          {Object.entries(FONT_PAIRINGS).map(([key, pairing]) => (
            <option key={key} value={key}>
              {pairing.label}
            </option>
          ))}
        </select>
      </div>

      <h3 style={{ fontSize: 15, margin: "18px 0 2px" }}>Dark mode palette</h3>
      <p className="faint" style={{ marginTop: 0, fontSize: 12 }}>
        Used when a member switches to dark mode (toggle in the top bar).
        Primary and secondary carry over automatically.
      </p>
      <div className="row wrap">
        {colourField("db", "Background", darkBackground, setDarkBackground, "darkBackground")}
        {colourField("dt", "Top bar", darkTopbar, setDarkTopbar, "darkTopbar")}
        {colourField("dx", "Text", darkText, setDarkText, "darkText")}
      </div>

      <div style={{ marginTop: 12 }}>
        <ImageUploadField
          id="cover"
          label="Cover image"
          value={cover}
          onChange={setCover}
          purpose="timetable-cover"
          timetableIdOrSlug={slug}
          onUploadingChange={setUploadingCover}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <ImageUploadField
          id="icon"
          label="Icon (square, shown in the switcher and top bar)"
          value={icon}
          onChange={setIcon}
          purpose="timetable-icon"
          timetableIdOrSlug={slug}
          onUploadingChange={setUploadingIcon}
        />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="btn btn-primary"
          type="submit"
          disabled={pending || uploadingCover || uploadingIcon}
        >
          {uploadingCover || uploadingIcon
            ? "Uploading…"
            : pending
              ? "Saving…"
              : saved
                ? "Saved"
                : "Save theme"}
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={discard}
          disabled={pending}
        >
          Discard
        </button>
      </div>
    </form>
  );
}
