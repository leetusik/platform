"use client";

import type { FormEvent, MouseEvent } from "react";
import { useEffect, useRef } from "react";

import { FILTER } from "@/content/feedback-frame";
import { langAttr } from "@/lib/feedback/lang";

/**
 * Seg (`FilterBar.dc.html`, frame.md F128, F144): a filter of a few values, `div.seg[role=group]` of
 * `button.seg-item[aria-pressed]`; the pressed one is ink, underlined. Disabled, the group sinks as a
 * disabled field does (the sheet's `.seg:has(> .seg-item:disabled)`). With `name` each toggle is a
 * submit button of its form, so a GET form applies it at once; else `onPick` is told.
 */
export interface SegOption<Value extends string> {
  value: Value;
  label: string;
}

export interface SegProps<Value extends string> {
  /** The group's name: `Rating`. */
  label: string;
  options: readonly SegOption<Value>[];
  /** The pressed value. */
  value: Value;
  /** The form field the toggles submit, in a form. */
  name?: string;
  disabled?: boolean;
  onPick?: (value: Value, event: MouseEvent<HTMLButtonElement>) => void;
}

export function Seg<Value extends string>({
  label,
  options,
  value,
  name,
  disabled = false,
  onPick,
}: SegProps<Value>) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type={name ? "submit" : "button"}
          className="seg-item"
          aria-pressed={option.value === value}
          name={name}
          value={option.value}
          disabled={disabled || undefined}
          onClick={onPick ? (event) => onPick(option.value, event) : undefined}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export type RatingFilter = "liked" | "disliked";

export interface FilterBarProject {
  id: string;
  name: string;
}

export interface FilterBarNames {
  q: string;
  project: string;
  rating: string;
}

const NAMES: FilterBarNames = { q: "q", project: "project", rating: "rating" };

export interface FilterBarProps {
  /** Where the form goes without script: the list's address for what the Shell shows. */
  action: string;
  /** Fields the list's address keeps that the bar does not show, sent as hidden inputs. */
  keep?: Readonly<Record<string, string>>;
  /** The address's names for the three fields; `q`, `project`, `rating` by default. */
  names?: FilterBarNames;
  /** The search as the address has it. */
  q?: string;
  /** The org's projects for the select; null leaves the select out (a project picked in the Shell). */
  projects?: readonly FilterBarProject[] | null;
  /** The picked project's id; null or `""` is All projects. */
  project?: string | null;
  rating?: RatingFilter | null;
  /** The whole bar, or none of it (F141, F144): while the page itself loads, or an org has no project. */
  disabled?: boolean;
  /** A search (Enter or Search), with what is typed. */
  onSearch?: (q: string) => void;
  /** A project picked, with what is typed. */
  onProject?: (project: string | null, q: string) => void;
  /** A rating pressed, with what is typed. */
  onRating?: (rating: RatingFilter | null, q: string) => void;
}

const RATINGS: readonly SegOption<"" | RatingFilter>[] = [
  { value: "", label: FILTER.anyRating },
  { value: "liked", label: FILTER.liked },
  { value: "disliked", label: FILTER.disliked },
];

/**
 * FilterBar (`FilterBar.dc.html`, frame.md F128, F141, F144): the list's search and filters, the first
 * row of its panel, a GET `form.filterbar[role=search]`: the search field and **Search**, the project
 * select (left out with a project picked in the Shell), the rating toggles (no filter for unrated).
 * Search runs on Enter or the button; the select and the toggles apply at once and take what is typed
 * with them. Without script the form submits to `action`. With the handlers the page navigates itself:
 * the bar reads no address and fetches nothing. A new search or filter starting at page 1 is the
 * address's rule (the page's), as is dropping blank fields.
 */
export function FilterBar({
  action,
  keep = {},
  names = NAMES,
  q = "",
  projects = null,
  project = null,
  rating = null,
  disabled = false,
  onSearch,
  onProject,
  onRating,
}: FilterBarProps) {
  const typed = (form: HTMLFormElement | null) =>
    form ? String(new FormData(form).get(names.q) ?? "") : q;
  // The field and the select are uncontrolled (what is typed or picked is the person's until it is
  // sent); a new address puts its values in place without redrawing them, so a search that lands keeps
  // focus in the field it was sent from, and a picked project keeps focus on the select (P65-nh.S9: a
  // `key` per value redrew them and dropped focus to the page).
  const field = useRef<HTMLInputElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (field.current && field.current.value !== q) field.current.value = q;
  }, [q]);
  useEffect(() => {
    const value = project ?? "";
    if (select.current && select.current.value !== value)
      select.current.value = value;
  }, [project]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter?.getAttribute("name") === names.rating) {
      if (!onRating) return;
      event.preventDefault();
      const value = submitter.getAttribute("value");
      onRating(
        value === "liked" || value === "disliked" ? value : null,
        typed(form),
      );
      return;
    }
    if (!onSearch) return;
    event.preventDefault();
    onSearch(typed(form));
  };

  return (
    <form
      className="filterbar"
      role="search"
      aria-label={FILTER.search}
      method="get"
      action={action}
      onSubmit={submit}
    >
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="filterbar-search">
        <input
          ref={field}
          className="input"
          type="search"
          aria-label={FILTER.search}
          placeholder={FILTER.placeholder}
          name={names.q}
          defaultValue={q}
          disabled={disabled || undefined}
        />
        <button type="submit" className="btn" disabled={disabled || undefined}>
          {FILTER.submit}
        </button>
      </div>
      {projects ? (
        <div className="select">
          <select
            ref={select}
            className="input"
            aria-label={FILTER.project}
            name={names.project}
            defaultValue={project ?? ""}
            disabled={disabled || undefined}
            onChange={(event) => {
              const form = event.currentTarget.form;
              if (onProject)
                onProject(event.currentTarget.value || null, typed(form));
              else form?.requestSubmit();
            }}
          >
            <option value="">{FILTER.allProjects}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id} lang={langAttr(p.name)}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Seg
        label={FILTER.rating}
        options={RATINGS}
        value={rating ?? ""}
        name={names.rating}
        disabled={disabled}
      />
    </form>
  );
}
