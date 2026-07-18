"use client";

import { useRef, useState } from "react";
import { categories, type CategoryId, type Tile } from "@/app/data/tiles";
import { voiceOptions, type VoiceId } from "@/app/lib/audio-voices";
import { compressPersonalPhoto, normalizeWord, type PersonalPictureKind, type PersonalTile } from "@/app/lib/personal-tiles";

const partOfSpeechOptions: Array<{ value: Tile["part_of_speech"]; label: string }> = [
  { value: "noun", label: "Noun" },
  { value: "verb", label: "Verb" },
  { value: "adjective", label: "Describing word" },
  { value: "social", label: "Social word" },
  { value: "pronoun", label: "Pronoun" },
  { value: "negation", label: "Negation" },
  { value: "determiner", label: "Determiner" },
  { value: "preposition", label: "Preposition" },
  { value: "question", label: "Question" },
];

export type PersonalTileDraft = {
  id?: string;
  word: string;
  pictureKind: PersonalPictureKind;
  emoji: string;
  photo: Blob | null;
  partOfSpeech: Tile["part_of_speech"];
  secondaryCategory: Exclude<CategoryId, "my_words"> | null;
};

export function CaregiverCredits({
  onClose,
  selectedVoice,
  onChangeVoice,
  onPreviewVoice,
  onEndSession,
  sentenceSuggestionsEnabled,
  onChangeSentenceSuggestions,
  personalTiles,
  photoCount,
  onSavePersonalTile,
  onHidePersonalTile,
  onRetryVoice,
}: {
  onClose: () => void;
  selectedVoice: VoiceId;
  onChangeVoice: (voice: VoiceId) => void;
  onPreviewVoice: (voice: VoiceId) => void;
  onEndSession: () => void;
  sentenceSuggestionsEnabled: boolean;
  onChangeSentenceSuggestions: (enabled: boolean) => void;
  personalTiles: readonly PersonalTile[];
  photoCount: number;
  onSavePersonalTile: (draft: PersonalTileDraft) => Promise<void>;
  onHidePersonalTile: (tileId: string) => void;
  onRetryVoice: (tileId: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PersonalTile | null>(null);
  const [word, setWord] = useState("");
  const [pictureKind, setPictureKind] = useState<PersonalPictureKind>("photo");
  const [emoji, setEmoji] = useState("⭐");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [partOfSpeech, setPartOfSpeech] = useState<Tile["part_of_speech"]>("noun");
  const [secondaryCategory, setSecondaryCategory] = useState<Exclude<CategoryId, "my_words"> | null>(null);
  const [photoMessage, setPhotoMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const pressTimer = useRef<number | null>(null);

  function resetForm() {
    setEditing(null);
    setWord("");
    setPictureKind("photo");
    setEmoji("⭐");
    setPhoto(null);
    setPartOfSpeech("noun");
    setSecondaryCategory(null);
    setPhotoMessage("");
  }

  function openAddWord() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(tile: PersonalTile) {
    setEditing(tile);
    setWord(tile.label_en);
    setPictureKind(tile.picture_kind);
    setEmoji(tile.symbol.emoji ?? "⭐");
    setPhoto(tile.photoBlob);
    setPartOfSpeech(tile.part_of_speech);
    setSecondaryCategory(tile.secondary_category);
    setPhotoMessage("");
    setShowForm(true);
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    try {
      const compressed = await compressPersonalPhoto(file);
      setPhoto(compressed);
      setPictureKind("photo");
      setPhotoMessage(`Photo ready (${Math.round(compressed.size / 1024)} KB).`);
    } catch (error) {
      setPhotoMessage(error instanceof Error ? error.message : "That photo could not be used.");
    }
  }

  async function save() {
    const normalized = normalizeWord(word);
    if (!normalized || saving) return;
    setSaving(true);
    try {
      await onSavePersonalTile({
        id: editing?.id,
        word: normalized,
        pictureKind,
        emoji: emoji.trim().slice(0, 8),
        photo,
        partOfSpeech,
        secondaryCategory,
      });
      setShowForm(false);
      resetForm();
    } finally {
      setSaving(false);
    }
  }

  function startLongPress(tile: PersonalTile) {
    pressTimer.current = window.setTimeout(() => openEdit(tile), 600);
  }

  function stopLongPress() {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  if (showForm) {
    return (
      <main className="caregiver-screen">
        <header className="caregiver-header">
          <p className="eyebrow">CAREGIVER TOOLS</p>
          <h1>{editing ? "Edit a word" : "Add a word"}</h1>
        </header>
        <section className="credits-card word-form">
          <label>
            <span>Word (English)</span>
            <input value={word} maxLength={200} onChange={(event) => setWord(event.target.value)} autoFocus required />
          </label>
          <fieldset>
            <legend>Picture</legend>
            <div className="picture-kind-options">
              {(["photo", "emoji", "text"] as const).map((kind) => (
                <button key={kind} type="button" aria-pressed={pictureKind === kind} onClick={() => setPictureKind(kind)}>
                  {kind === "photo" ? "Take or choose photo" : kind === "emoji" ? "Pick an emoji" : "Plain text"}
                </button>
              ))}
            </div>
            {pictureKind === "photo" && (
              <>
                <input type="file" accept="image/*" capture="environment" onChange={(event) => void choosePhoto(event.target.files?.[0])} />
                <p className="privacy-note">Photos never leave this device. They are cropped square and compressed before local storage.</p>
                {photoMessage && <p className="form-note">{photoMessage}</p>}
              </>
            )}
            {pictureKind === "emoji" && (
              <label>
                <span>Emoji</span>
                <input value={emoji} onChange={(event) => setEmoji(event.target.value)} maxLength={8} aria-label="Emoji" />
              </label>
            )}
          </fieldset>
          <label>
            <span>Part of speech</span>
            <select value={partOfSpeech} onChange={(event) => setPartOfSpeech(event.target.value as Tile["part_of_speech"])}>
              {partOfSpeechOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>Category</span>
            <select value={secondaryCategory ?? "my_words"} onChange={(event) => setSecondaryCategory(event.target.value === "my_words" ? null : event.target.value as Exclude<CategoryId, "my_words">)}>
              <option value="my_words">My words only</option>
              {categories.filter((category) => category.id !== "my_words").map((category) => <option key={category.id} value={category.id}>My words + {category.label}</option>)}
            </select>
          </label>
          {editing && <button className="hide-word" type="button" onClick={() => { onHidePersonalTile(editing.id); setShowForm(false); resetForm(); }}>Hide this word</button>}
          <button className="caregiver-back" type="button" disabled={!normalizeWord(word) || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save word"}
          </button>
          <button className="form-cancel" type="button" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
        </section>
      </main>
    );
  }

  return (
    <main className="caregiver-screen">
      <header className="caregiver-header">
        <p className="eyebrow">CAREGIVER TOOLS</p>
        <h1>Caregiver mode</h1>
      </header>

      <section className="credits-card" aria-labelledby="my-words">
        <h2 id="my-words">My words</h2>
        <p>Add familiar people, pets, foods, and comfort objects. Photos never leave this device. {photoCount}/50 photo tiles used.</p>
        <button className="add-word" type="button" onClick={openAddWord}>Add a word</button>
        {personalTiles.length ? (
          <div className="personal-tile-list" aria-label="Personal words. Long press a word to edit or hide it.">
            {personalTiles.map((tile) => (
              <button
                key={tile.id}
                className="personal-tile-entry"
                type="button"
                onPointerDown={() => startLongPress(tile)}
                onPointerUp={stopLongPress}
                onPointerCancel={stopLongPress}
                onPointerLeave={stopLongPress}
                onClick={() => tile.voice_pending && onRetryVoice(tile.id)}
              >
                {tile.label_en}{tile.voice_pending ? " · voice pending — tap to retry" : ""}
              </button>
            ))}
          </div>
        ) : <p className="form-note">No personal words yet.</p>}
      </section>

      <section className="credits-card" aria-labelledby="symbol-credits">
        <h2 id="symbol-credits">Picture symbols</h2>
        <p>Mynah uses ARASAAC pictograms created by Sergio Palao. They are included on this device so the board can work offline.</p>
        <p>ARASAAC symbols are licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International.</p>
        <a href="https://arasaac.org" target="_blank" rel="noreferrer">Visit ARASAAC</a>
      </section>

      <section className="credits-card" aria-labelledby="sentence-suggestions">
        <h2 id="sentence-suggestions">Sentence suggestions</h2>
        <p>Offer optional picture-only sentence choices after one tapped noun or verb.</p>
        <button className="sentence-suggestions-toggle" type="button" aria-pressed={sentenceSuggestionsEnabled} onClick={() => onChangeSentenceSuggestions(!sentenceSuggestionsEnabled)}>{sentenceSuggestionsEnabled ? "On" : "Off"}</button>
      </section>

      <section className="credits-card" aria-labelledby="voice-choice">
        <h2 id="voice-choice">Board voice</h2>
        <p>Choose the voice that feels right for your child. It stays on this device.</p>
        <div className="voice-options">
          {voiceOptions.map((voice) => (
            <div className="voice-option" key={voice.id}>
              <button className="voice-select" type="button" aria-pressed={selectedVoice === voice.id} onClick={() => onChangeVoice(voice.id)}>{voice.label}</button>
              <button className="voice-preview" type="button" onClick={() => onPreviewVoice(voice.id)}>Preview</button>
            </div>
          ))}
        </div>
      </section>

      <button className="end-session" type="button" onClick={onEndSession}>End this session</button>
      <button className="caregiver-back" type="button" onClick={onClose}>Back to board</button>
    </main>
  );
}
