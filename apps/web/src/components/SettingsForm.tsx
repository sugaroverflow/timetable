"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ImageUploadField } from "@/components/ImageUploadField";
import {
  DEFAULT_THEME_DARK,
  DEFAULT_THEME_LIGHT,
  FONT_PAIRINGS,
  themeVars,
  type DigestSettings,
  type ThemeSettings,
} from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation Theme($s: String!, $theme: String, $cover: String, $icon: String, $emoji: String) {
  updateTimetableSettings(
    idOrSlug: $s
    themeJson: $theme
    coverImageUrl: $cover
    iconUrl: $icon
    iconEmoji: $emoji
  ) { id }
}`;

// Curated quick-pick set — enough breadth for a timetable/faculty context
// without pulling in a heavyweight emoji-picker dependency.
const EMOJI_CHOICES = [
  "📚",
  "🎓",
  "🏛️",
  "🗳️",
  "💡",
  "📊",
  "📈",
  "🔬",
  "⚖️",
  "🌍",
  "🤝",
  "💬",
  "📅",
  "⭐",
  "❤️",
  "🔥",
  "🎯",
  "🧠",
  "🏆",
  "📝",
  "🎤",
  "🌱",
  "⚡",
  "🎨",
];

export type SettingsValues = {
  roleLabels?: { admin?: string; host?: string; elector?: string };
  theme?: ThemeSettings;
  coverImageUrl?: string | null;
  iconUrl?: string | null;
  iconEmoji?: string | null;
  digestDefaults?: DigestSettings;
};

type ThemeState = {
  primary: string;
  secondary: string;
  background: string;
  topbar: string;
  topbarText: string;
  text: string;
  font: string;
  darkPrimary: string;
  darkSecondary: string;
  darkBackground: string;
  darkTopbar: string;
  darkTopbarText: string;
  darkText: string;
  cover: string;
  icon: string;
  iconEmoji: string;
};

function initialLightFields(theme: ThemeSettings) {
  return {
    primary: theme.primary ?? DEFAULT_THEME_LIGHT.primary,
    secondary: theme.secondary ?? DEFAULT_THEME_LIGHT.secondary,
    background: theme.background ?? DEFAULT_THEME_LIGHT.background,
    topbar: theme.topbar ?? DEFAULT_THEME_LIGHT.topbar,
    topbarText: theme.topbarText ?? DEFAULT_THEME_LIGHT.topbarText,
    text: theme.text ?? DEFAULT_THEME_LIGHT.text,
    font: theme.font ?? DEFAULT_THEME_LIGHT.font,
  };
}

function initialDarkFields(theme: ThemeSettings) {
  const dark = theme.dark ?? {};
  return {
    darkPrimary: dark.primary ?? theme.primary ?? DEFAULT_THEME_DARK.primary,
    darkSecondary:
      dark.secondary ?? theme.secondary ?? DEFAULT_THEME_DARK.secondary,
    darkBackground: dark.background ?? DEFAULT_THEME_DARK.background,
    darkTopbar: dark.topbar ?? DEFAULT_THEME_DARK.topbar,
    darkTopbarText: dark.topbarText ?? DEFAULT_THEME_DARK.topbarText,
    darkText: dark.text ?? DEFAULT_THEME_DARK.text,
  };
}

// Single source for both the initial state and what Discard restores.
function initialState(current: SettingsValues): ThemeState {
  const theme = current.theme ?? {};
  return {
    ...initialLightFields(theme),
    ...initialDarkFields(theme),
    cover: current.coverImageUrl ?? "",
    icon: current.iconUrl ?? "",
    iconEmoji: current.iconEmoji ?? "",
  };
}

function toTheme(state: ThemeState): ThemeSettings {
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

type ColourFieldSpec = { id: string; label: string; key: keyof ThemeState };

const LIGHT_COLOUR_FIELDS: readonly ColourFieldSpec[] = [
  { id: "tp", label: "Primary", key: "primary" },
  { id: "ts", label: "Secondary", key: "secondary" },
  { id: "tb", label: "Background", key: "background" },
  { id: "tt", label: "Top bar", key: "topbar" },
  { id: "tti", label: "Top bar text", key: "topbarText" },
  { id: "tx", label: "Text", key: "text" },
];

const DARK_COLOUR_FIELDS: readonly ColourFieldSpec[] = [
  { id: "dp", label: "Primary", key: "darkPrimary" },
  { id: "ds", label: "Secondary", key: "darkSecondary" },
  { id: "db", label: "Background", key: "darkBackground" },
  { id: "dt", label: "Top bar", key: "darkTopbar" },
  { id: "dti", label: "Top bar text", key: "darkTopbarText" },
  { id: "dx", label: "Text", key: "darkText" },
];

function ColourGroup({
  fields,
  state,
  onChange,
}: {
  fields: readonly ColourFieldSpec[];
  state: ThemeState;
  onChange: (key: keyof ThemeState, value: string) => void;
}) {
  return (
    <div className="row wrap">
      {fields.map(({ id, label, key }) => (
        <div key={id} className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={id}>{label}</label>
          <input
            id={id}
            type="color"
            value={state[key]}
            onChange={(e) => onChange(key, e.target.value)}
            style={{ width: 64, padding: 2, height: 38 }}
          />
        </div>
      ))}
    </div>
  );
}

function FontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field" style={{ marginTop: 12 }}>
      <label htmlFor="tf">Fonts</label>
      <select id="tf" value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(FONT_PAIRINGS).map(([key, pairing]) => (
          <option key={key} value={key}>
            {pairing.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function EmojiPicker({
  value,
  onChoose,
}: {
  value: string;
  onChoose: (value: string) => void;
}) {
  return (
    <div className="field" style={{ marginTop: 12 }}>
      <label>Or pick an emoji icon</label>
      <p className="faint" style={{ marginTop: 0, fontSize: 12 }}>
        An emoji is used instead of an uploaded image.
      </p>
      <div className="emoji-grid" role="group" aria-label="Icon emoji">
        {EMOJI_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            className={value === choice ? "emoji-choice on" : "emoji-choice"}
            aria-pressed={value === choice}
            onClick={() => onChoose(value === choice ? "" : choice)}
          >
            {choice}
          </button>
        ))}
      </div>
      {value ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => onChoose("")}
        >
          Clear emoji
        </button>
      ) : null}
    </div>
  );
}

/** Theme section of Settings (QA #59): every base colour, an optional dark
 * palette, font pairing, cover image, and icon — with live preview. */
export function SettingsForm({
  slug,
  current,
}: {
  slug: string;
  current: SettingsValues;
}) {
  const { run, busy } = useGqlAction();
  const [saved, setSaved] = useState(false);
  const initial = initialState(current);
  const [state, setState] = useState<ThemeState>(initial);
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

  function setField(key: keyof ThemeState, value: string) {
    setState((s) => ({ ...s, [key]: value }));
  }

  // Colour and font edits re-render the live preview alongside the state.
  function setThemeField(key: keyof ThemeState, value: string) {
    setField(key, value);
    applyPreview(toTheme({ ...state, [key]: value }));
  }

  // Emoji and uploaded image are mutually exclusive icon sources — setting one
  // clears the other so the render precedence (emoji > image > letter) is
  // unambiguous.
  function chooseEmoji(value: string) {
    setField("iconEmoji", value);
    if (value) setField("icon", "");
  }
  function handleIconChange(value: string) {
    setField("icon", value);
    if (value.trim()) setField("iconEmoji", "");
  }

  function discard() {
    setState(initial);
    // Reset: drop the inline overrides so the page falls back to the saved
    // theme rendered by the SSR <style> tag.
    clearPreview();
    setSaved(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    void run(
      MUTATION,
      {
        s: slug,
        theme: JSON.stringify(toTheme(state)),
        cover: state.cover.trim() || null,
        icon: state.icon.trim() || null,
        emoji: state.iconEmoji.trim() || null,
      },
      {
        success: "Theme saved",
        errorFallback: "Could not save theme",
        onSuccess: () => setSaved(true),
      },
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Theme</h2>
      <p className="faint" style={{ marginTop: 0, fontSize: 12 }}>
        Colours preview live — Save to keep them, Discard to revert.
      </p>

      <ColourGroup
        fields={LIGHT_COLOUR_FIELDS}
        state={state}
        onChange={setThemeField}
      />

      <FontPicker
        value={state.font}
        onChange={(value) => setThemeField("font", value)}
      />

      <h3 style={{ fontSize: 15, margin: "18px 0 2px" }}>Dark mode palette</h3>
      <p className="faint" style={{ marginTop: 0, fontSize: 12 }}>
        Used when a member switches to dark mode (toggle on their Profile page).
      </p>
      <ColourGroup
        fields={DARK_COLOUR_FIELDS}
        state={state}
        onChange={setThemeField}
      />

      <div style={{ marginTop: 12 }}>
        <ImageUploadField
          id="cover"
          label="Cover image"
          value={state.cover}
          onChange={(value) => setField("cover", value)}
          purpose="timetable-cover"
          timetableIdOrSlug={slug}
          onUploadingChange={setUploadingCover}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <ImageUploadField
          id="icon"
          label="Icon (square, shown in the switcher and top bar)"
          value={state.icon}
          onChange={handleIconChange}
          purpose="timetable-icon"
          timetableIdOrSlug={slug}
          onUploadingChange={setUploadingIcon}
        />
      </div>

      <EmojiPicker value={state.iconEmoji} onChoose={chooseEmoji} />

      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || uploadingCover || uploadingIcon}
        >
          {uploadingCover || uploadingIcon
            ? "Uploading…"
            : busy
              ? "Saving…"
              : saved
                ? "Saved"
                : "Save theme"}
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={discard}
          disabled={busy}
        >
          Discard
        </button>
      </div>
    </form>
  );
}
