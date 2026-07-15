"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ImageUploadField } from "@/components/ImageUploadField";
import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";
import {
  DEFAULT_THEME_DARK,
  DEFAULT_THEME_LIGHT,
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
    primary: current.theme?.primary ?? DEFAULT_THEME_LIGHT.primary,
    secondary: current.theme?.secondary ?? DEFAULT_THEME_LIGHT.secondary,
    background: current.theme?.background ?? DEFAULT_THEME_LIGHT.background,
    topbar: current.theme?.topbar ?? DEFAULT_THEME_LIGHT.topbar,
    topbarText: current.theme?.topbarText ?? DEFAULT_THEME_LIGHT.topbarText,
    text: current.theme?.text ?? DEFAULT_THEME_LIGHT.text,
    font: current.theme?.font ?? DEFAULT_THEME_LIGHT.font,
    darkPrimary:
      current.theme?.dark?.primary ??
      current.theme?.primary ??
      DEFAULT_THEME_DARK.primary,
    darkSecondary:
      current.theme?.dark?.secondary ??
      current.theme?.secondary ??
      DEFAULT_THEME_DARK.secondary,
    darkBackground:
      current.theme?.dark?.background ?? DEFAULT_THEME_DARK.background,
    darkTopbar: current.theme?.dark?.topbar ?? DEFAULT_THEME_DARK.topbar,
    darkTopbarText:
      current.theme?.dark?.topbarText ?? DEFAULT_THEME_DARK.topbarText,
    darkText: current.theme?.dark?.text ?? DEFAULT_THEME_DARK.text,
    cover: current.coverImageUrl ?? "",
    icon: current.iconUrl ?? "",
  };

  const [primary, setPrimary] = useState(initial.primary);
  const [secondary, setSecondary] = useState(initial.secondary);
  const [background, setBackground] = useState(initial.background);
  const [topbar, setTopbar] = useState(initial.topbar);
  const [topbarText, setTopbarText] = useState(initial.topbarText);
  const [text, setText] = useState(initial.text);
  const [font, setFont] = useState(initial.font);
  const [darkPrimary, setDarkPrimary] = useState(initial.darkPrimary);
  const [darkSecondary, setDarkSecondary] = useState(initial.darkSecondary);
  const [darkBackground, setDarkBackground] = useState(initial.darkBackground);
  const [darkTopbar, setDarkTopbar] = useState(initial.darkTopbar);
  const [darkTopbarText, setDarkTopbarText] = useState(initial.darkTopbarText);
  const [darkText, setDarkText] = useState(initial.darkText);
  const [cover, setCover] = useState(initial.cover);
  const [icon, setIcon] = useState(initial.icon);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  // Live preview writes theme vars onto :root (document.documentElement) so
  // every surface updates — background, top bar, and top-bar text included —
  // and preview matches what the saved <style> tag will render. We record
  // exactly which custom properties we set, so cleanup removes precisely those;
  // without it the in-progress theme would leak onto other pages.
  const previewKeys = useRef<string[]>([]);

  const applyPreview = (theme: ThemeSettings) => {
    const root = document.documentElement;
    const mode = root.dataset.theme === "dark" ? "dark" : "light";
    // Drop the prior preview's props first so cleared values fall back to the
    // SSR <style> tag rather than lingering.
    for (const name of previewKeys.current) root.style.removeProperty(name);
    const vars = themeVars(theme, mode);
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
    previewKeys.current = Object.keys(vars);
  };

  const clearPreview = useCallback(() => {
    const root = document.documentElement;
    for (const name of previewKeys.current) root.style.removeProperty(name);
    previewKeys.current = [];
  }, []);

  // Strip any preview overrides when the form unmounts (navigating away) so the
  // in-progress theme can't leak onto other pages; the SSR <style> tag remains
  // the source of truth.
  useEffect(() => clearPreview, [clearPreview]);

  type State = typeof initial;

  function toTheme(state: State): ThemeSettings {
    return {
      primary: state.primary,
      secondary: state.secondary,
      background: state.background,
      topbar: state.topbar,
      topbarText: state.topbarText,
      text: state.text,
      font: state.font,
      dark: {
        primary: state.darkPrimary,
        secondary: state.darkSecondary,
        background: state.darkBackground,
        topbar: state.darkTopbar,
        topbarText: state.darkTopbarText,
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
      topbarText,
      text,
      font,
      darkPrimary,
      darkSecondary,
      darkBackground,
      darkTopbar,
      darkTopbarText,
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
    setTopbarText(initial.topbarText);
    setText(initial.text);
    setFont(initial.font);
    setDarkPrimary(initial.darkPrimary);
    setDarkSecondary(initial.darkSecondary);
    setDarkBackground(initial.darkBackground);
    setDarkTopbar(initial.darkTopbar);
    setDarkTopbarText(initial.darkTopbarText);
    setDarkText(initial.darkText);
    setCover(initial.cover);
    setIcon(initial.icon);
    // Reset: drop the inline overrides so the page falls back to the saved
    // theme rendered by the SSR <style> tag.
    clearPreview();
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
        {colourField("tti", "Top bar text", topbarText, setTopbarText, "topbarText")}
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
        Used when a member switches to dark mode (toggle on their Profile
        page).
      </p>
      <div className="row wrap">
        {colourField("dp", "Primary", darkPrimary, setDarkPrimary, "darkPrimary")}
        {colourField("ds", "Secondary", darkSecondary, setDarkSecondary, "darkSecondary")}
        {colourField("db", "Background", darkBackground, setDarkBackground, "darkBackground")}
        {colourField("dt", "Top bar", darkTopbar, setDarkTopbar, "darkTopbar")}
        {colourField("dti", "Top bar text", darkTopbarText, setDarkTopbarText, "darkTopbarText")}
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
