export const FORM_CLIENT_SCRIPT = String.raw`(() => {
  "use strict";
  const root = document.getElementById("eidos-form-root");
  const slug = root && root.dataset.slug;
  if (!root || !slug) return;

  const booleanProperties = new Set([
    "disabled",
    "hidden",
    "multiple",
    "required",
    "selected",
  ]);
  const el = (tag, attrs = {}, text) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (booleanProperties.has(key)) node[key] = Boolean(value);
      else node.setAttribute(key, String(value));
    }
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const hex = (buffer) =>
    Array.from(new Uint8Array(buffer), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  const id = () => crypto.randomUUID().replaceAll("-", "");
  const formPath = "/" + slug.split("/").map(encodeURIComponent).join("/");
  const successPath = "/_eidos/forms/" + encodeURIComponent(slug) + "/success";
  // Also style previously published HTML, whose immutable artifact predates v4.
  const style = el("style", {}, [
    ".submit-button { position: relative; text-decoration: none; box-sizing: border-box; }",
    ".submit-button[aria-busy=\"true\"] .submit-label { visibility: hidden; }",
    ".submit-progress { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: .5rem; }",
    ".submit-progress[hidden] { display: none; }",
    ".submit-spinner { width: .875rem; height: .875rem; flex: none; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: form-spin .8s linear infinite; }",
    ".form-announcement { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }",
    ".form-success { display: grid; gap: 1.5rem; }",
    ".form-success h1, .form-success p { margin: 0; }",
    ".form-success-message { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .875rem; line-height: 1.5rem; }",
    ".form-success .submit-button { min-height: 2rem; height: auto; padding: .5rem .75rem; white-space: normal; }",
    "@keyframes form-spin { to { transform: rotate(360deg); } }",
    "@media (prefers-reduced-motion: reduce) { .submit-spinner { animation: none; } }",
  ].join("\n"));
  document.head.append(style);

  async function request(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      return await checked(
        await fetch(url, { ...options, signal: controller.signal }),
        copy.failed
      );
    } catch (error) {
      if (controller.signal.aborted) throw new Error(copy.timeout);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function checked(response, fallback) {
    const value = await response.json().catch(() => null);
    if (
      response.status === 401 &&
      typeof value?.authorizationUrl === "string"
    ) {
      location.assign(value.authorizationUrl);
      return new Promise(() => {});
    }
    if (!response.ok) throw new Error(value?.error?.message || fallback);
    return value;
  }

  function embeddedDefinition() {
    const node = document.getElementById("eidos-form-definition");
    if (!node) throw new Error("This form is unavailable.");
    const value = JSON.parse(node.textContent || "null");
    if (
      !value ||
      value.spec !== "eidos.publish/public-form@1" ||
      typeof value.publicationVersionId !== "string" ||
      !value.presentation ||
      !Array.isArray(value.fields)
    ) {
      throw new Error("This form is unavailable.");
    }
    return value;
  }

  async function loadSubmissionIntent(publicationVersionId) {
    const value = await request(
      "/_eidos/forms/" + encodeURIComponent(slug) + "/definition",
      { credentials: "same-origin" }
    );
    if (
      value.publicationVersionId !== publicationVersionId ||
      typeof value.submissionIntent !== "string"
    ) {
      throw new Error("This form changed. Reload and try again.");
    }
    return value.submissionIntent;
  }

  const chinese = navigator.language.toLowerCase().startsWith("zh");
  const copy = chinese
    ? {
        empty: "空",
        chooseFile: "选择文件",
        chooseFiles: "选择文件",
        noFile: "未选择文件",
        submitting: "正在提交…",
        required: "请填写必填项。",
        received: "提交成功",
        another: "返回继续提交",
        failed: "提交失败，请重试。",
        timeout: "提交超时，已填写的内容会保留，请重试。",
      }
    : {
        empty: "Empty",
        chooseFile: "Choose file",
        chooseFiles: "Choose files",
        noFile: "No file chosen",
        submitting: "Submitting…",
        required: "Complete the required fields.",
        received: "Response received",
        another: "Submit another response",
        failed: "Submission failed. Please try again.",
        timeout: "The request timed out. Your answers are kept. Please try again.",
      };
  document.documentElement.lang = chinese ? "zh-CN" : "en";
  let responseCommitted = false;

  function renderSuccess(definition) {
    document.title = copy.received + " — " + definition.presentation.title;
    const section = el("section", { class: "form-success" });
    section.append(
      el("h1", {}, copy.received),
      el("p", { class: "form-success-message" }, definition.presentation.successMessage),
      el("a", { class: "submit-button", href: formPath }, copy.another)
    );
    root.replaceChildren(section);
  }

  function optionTag(option) {
    return el(
      "span",
      {
        class: "option-tag",
        "data-option-color": option.color,
        title: option.name,
      },
      option.name
    );
  }

  function setChoiceOpen(control, trigger, menu, open) {
    control.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
  }

  function closeChoiceMenus(except) {
    for (const control of root.querySelectorAll(".choice-control.is-open")) {
      if (control === except) continue;
      const trigger = control.querySelector(".choice-trigger");
      const menu = control.querySelector(".choice-menu");
      if (trigger && menu) setChoiceOpen(control, trigger, menu, false);
    }
  }

  function choiceControl(field, multiple) {
    const options = field.constraints.options;
    const selected = new Set();
    const control = el("div", { class: "choice-control" });
    const trigger = el("button", {
      class: "choice-trigger",
      type: "button",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
      "aria-controls": "menu-" + field.inputKey,
    });
    const value = el("span", { class: "choice-value" });
    const chevron = el("span", {
      class: "choice-chevron",
      "aria-hidden": "true",
    });
    const menu = el("div", {
      class: "choice-menu",
      id: "menu-" + field.inputKey,
      role: "listbox",
      hidden: true,
      ...(multiple ? { "aria-multiselectable": "true" } : {}),
    });
    const rows = [];

    const renderValue = () => {
      value.replaceChildren();
      const chosen = options.filter((option) => selected.has(option.name));
      if (chosen.length === 0) {
        value.append(
          el(
            "span",
            { class: "choice-placeholder" },
            field.placeholder || copy.empty
          )
        );
      } else {
        value.append(...chosen.map(optionTag));
      }
      for (const row of rows) {
        row.node.setAttribute(
          "aria-selected",
          String(
            row.option === null
              ? selected.size === 0
              : selected.has(row.option.name)
          )
        );
      }
    };

    const clearInvalid = () => {
      control.classList.remove("is-invalid");
      trigger.setAttribute("aria-invalid", "false");
    };
    const choose = (option) => {
      if (multiple) {
        if (selected.has(option.name)) selected.delete(option.name);
        else selected.add(option.name);
      } else {
        selected.clear();
        if (option) selected.add(option.name);
      }
      clearInvalid();
      renderValue();
      if (!multiple) {
        setChoiceOpen(control, trigger, menu, false);
        trigger.focus();
      }
    };
    const appendRow = (option) => {
      const row = el("button", {
        class:
          "choice-menu-item" + (option === null ? " choice-empty-item" : ""),
        type: "button",
        role: "option",
        "aria-selected": "false",
      });
      row.append(el("span", { class: "choice-check", "aria-hidden": "true" }));
      row.append(option === null ? el("span", {}, copy.empty) : optionTag(option));
      row.addEventListener("click", () => choose(option));
      row.addEventListener("keydown", (event) => {
        const index = rows.findIndex((candidate) => candidate.node === row);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const delta = event.key === "ArrowDown" ? 1 : -1;
          rows[(index + delta + rows.length) % rows.length]?.node.focus();
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          rows[event.key === "Home" ? 0 : rows.length - 1]?.node.focus();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setChoiceOpen(control, trigger, menu, false);
          trigger.focus();
        }
      });
      rows.push({ node: row, option });
      menu.append(row);
    };

    if (!multiple) appendRow(null);
    for (const option of options) appendRow(option);
    trigger.append(value, chevron);
    trigger.addEventListener("click", () => {
      const open = !control.classList.contains("is-open");
      closeChoiceMenus(control);
      setChoiceOpen(control, trigger, menu, open);
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        closeChoiceMenus(control);
        setChoiceOpen(control, trigger, menu, true);
        rows[event.key === "ArrowDown" ? 0 : rows.length - 1]?.node.focus();
      } else if (event.key === "Escape") {
        setChoiceOpen(control, trigger, menu, false);
      }
    });
    control.append(trigger, menu);
    renderValue();
    return {
      root: control,
      input: trigger,
      value: () => (multiple ? Array.from(selected) : (selected.values().next().value ?? "")),
      reset: () => {
        selected.clear();
        clearInvalid();
        setChoiceOpen(control, trigger, menu, false);
        renderValue();
      },
      invalidate: () => {
        control.classList.add("is-invalid");
        trigger.setAttribute("aria-invalid", "true");
        trigger.focus();
      },
    };
  }

  document.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Node) || !event.target.closest?.(".choice-control")) {
      closeChoiceMenus();
    }
  });

  function control(field) {
    const constraints = field.constraints || {};
    if (field.type === "multi-select") {
      return choiceControl(field, true);
    }

    if (field.type === "select") {
      return choiceControl(field, false);
    }

    if (field.type === "file") {
      const input = el("input", {
        class: "file-input",
        type: "file",
        multiple: constraints.multiple !== false,
      });
      const summary = el("span", { class: "file-summary" }, copy.noFile);
      const shell = el("div", { class: "file-control" });
      shell.append(
        input,
        el(
          "span",
          { class: "file-action", "aria-hidden": "true" },
          constraints.multiple === false ? copy.chooseFile : copy.chooseFiles
        ),
        summary
      );
      input.addEventListener("change", () => {
        const names = Array.from(input.files || [], (file) => file.name);
        summary.textContent = names.length > 0 ? names.join(", ") : copy.noFile;
      });
      return { root: shell, input, summary };
    }

    if (field.type === "text" && field.multiline) {
      const input = el("textarea", { class: "form-control" });
      return { root: input, input };
    }

    const types = {
      integer: "number",
      number: "number",
      rating: "number",
      checkbox: "checkbox",
      date: "date",
      datetime: "datetime-local",
      url: "url",
    };
    const input = el("input", {
      class: field.type === "checkbox" ? "checkbox-control" : "form-control",
      type: types[field.type] || "text",
    });
    if (field.type === "integer") input.step = "1";
    if (typeof constraints.min === "number") input.min = String(constraints.min);
    if (typeof constraints.max === "number") input.max = String(constraints.max);
    return { root: input, input };
  }

  function render(definition) {
    root.replaceChildren();
    const header = el("header", { class: "form-header" });
    header.append(el("h1", {}, definition.presentation.title));
    if (definition.presentation.description) {
      header.append(
        el(
          "p",
          { class: "form-description" },
          definition.presentation.description
        )
      );
    }
    root.append(header);

    const form = el("form");
    const controls = new Map();
    for (const field of definition.fields) {
      const wrap = el("div", { class: "field" });
      const label = el("label", { class: "field-label" }, field.label);
      if (field.required) {
        label.append(el("span", { class: "required", "aria-hidden": "true" }, "*"));
      }
      const rendered = control(field);
      const fieldId = "field-" + field.inputKey;
      const descriptionId = fieldId + "-description";
      const nativeInput = rendered.input.matches("input, textarea, select");
      if (nativeInput) {
        label.htmlFor = fieldId;
        rendered.input.id = fieldId;
        rendered.input.name = field.inputKey;
        rendered.input.required =
          field.required && field.type !== "checkbox";
        if (field.placeholder && field.type !== "select") {
          rendered.input.placeholder = field.placeholder;
        }
      } else {
        label.id = fieldId + "-label";
        rendered.input.setAttribute("aria-labelledby", label.id);
        rendered.input.setAttribute(
          "aria-required",
          field.required ? "true" : "false"
        );
      }
      wrap.append(label);
      if (field.description) {
        const description = el(
          "p",
          { class: "field-description", id: descriptionId },
          field.description
        );
        rendered.input.setAttribute("aria-describedby", descriptionId);
        wrap.append(description);
      }
      wrap.append(rendered.root);
      controls.set(field.inputKey, { field, ...rendered });
      form.append(wrap);
    }

    let submitting = false;
    let pending = null;
    const fileIdentities = new WeakMap();
    const status = el("p", {
      class: "status",
      "aria-live": "polite",
    });
    const announcement = el("span", { class: "form-announcement", role: "status" });
    const button = el("button", { class: "submit-button", type: "submit" });
    const label = el("span", { class: "submit-label" }, definition.presentation.submitLabel);
    const progress = el("span", { class: "submit-progress", hidden: true, "aria-hidden": "true" });
    const spinner = el("span", { class: "submit-spinner" });
    const progressLabel = el("span", {}, copy.submitting);
    progress.append(spinner, progressLabel);
    button.append(label, progress);
    const actions = el("div", { class: "form-actions" });
    actions.append(button);
    form.append(status, actions, announcement);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submitting) return;
      submitting = true;
      // Size once from the resting label, then constrain progress to that box.
      const width = button.getBoundingClientRect().width;
      button.style.width = width + "px";
      progressLabel.hidden = width < 140;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.setAttribute("aria-label", copy.submitting);
      progress.hidden = false;
      form.setAttribute("aria-busy", "true");
      status.textContent = "";
      announcement.textContent = copy.submitting;
      try {
        const values = {};
        const attachments = [];
        const files = [];
        for (const [inputKey, controlState] of controls) {
          const { field, input } = controlState;
          if (field.type === "file") {
            for (const file of input.files || []) {
              let identity = fileIdentities.get(file);
              if (!identity) {
                identity = {
                  attachmentId: id(),
                  digest: hex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
                };
                fileIdentities.set(file, identity);
              }
              const { attachmentId, digest } = identity;
              attachments.push({
                attachmentId,
                inputKey,
                name: file.name,
                mediaType: file.type || "application/octet-stream",
                bytes: String(file.size),
                sha256: digest,
              });
              files.push({ attachmentId, file, digest });
            }
          } else if (field.type === "checkbox") {
            values[inputKey] = input.checked;
          } else if (field.type === "multi-select") {
            const selected = controlState.value();
            if (field.required && selected.length === 0) {
              controlState.invalidate();
              throw new Error(copy.required);
            }
            values[inputKey] = selected;
          } else if (field.type === "select") {
            const selected = controlState.value();
            if (field.required && selected === "") {
              controlState.invalidate();
              throw new Error(copy.required);
            }
            if (selected !== "") values[inputKey] = selected;
          } else if (input.value !== "") {
            values[inputKey] =
              field.type === "number" || field.type === "rating"
                ? Number(input.value)
                : field.type === "datetime"
                  ? new Date(input.value).toISOString()
                  : input.value;
          }
        }

        const submissionIntent = await loadSubmissionIntent(
          definition.publicationVersionId
        );
        const fingerprint = JSON.stringify({ values, attachments });
        if (!pending || pending.fingerprint !== fingerprint) {
          pending = { fingerprint, key: id(), initialized: null };
        }

        const initialized = pending.initialized || await request(
            "/_eidos/forms/" +
              encodeURIComponent(slug) +
              "/submissions/init",
            {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                intent: submissionIntent,
                idempotencyKey: pending.key,
                values,
                attachments,
              }),
            }
        );
        pending.initialized = initialized;
        for (const upload of initialized.attachments) {
          if (initialized.state === "committed" || upload.state === "ready" || upload.state === "promoted") continue;
          const item = files.find(
            (candidate) => candidate.attachmentId === upload.attachmentId
          );
          if (!item) continue;
          await request(upload.uploadUrl, {
              method: "PUT",
              credentials: "same-origin",
              headers: {
                "Content-Type": item.file.type || "application/octet-stream",
                "X-Eidos-Content-SHA256": item.digest,
                "X-Eidos-Submission-Intent": submissionIntent,
              },
              body: item.file,
            });
          upload.state = "ready";
        }
        const completed = await request(
            "/_eidos/forms/" +
              encodeURIComponent(slug) +
              "/submissions/" +
              initialized.submissionId +
              "/complete",
            {
              method: "POST",
              credentials: "same-origin",
              headers: {
                "X-Eidos-Submission-Intent": submissionIntent,
              },
            }
        );
        if (completed.state !== "committed" || completed.submissionId !== initialized.submissionId) {
          throw new Error(copy.failed);
        }
        // A GET document navigation cannot replay the submission on refresh.
        responseCommitted = true;
        history.replaceState({ eidosFormCompleted: definition.publicationVersionId }, "");
        location.assign(successPath);
      } catch (error) {
        responseCommitted = false;
        status.className = "status is-error";
        status.textContent =
          error instanceof Error ? error.message : copy.failed;
      } finally {
        if (!responseCommitted) {
          submitting = false;
          button.disabled = false;
          button.removeAttribute("aria-busy");
          button.removeAttribute("aria-label");
          button.style.removeProperty("width");
          progress.hidden = true;
          announcement.textContent = "";
          form.removeAttribute("aria-busy");
        }
      }
    });
    root.append(form);
  }

  try {
    const definition = embeddedDefinition();
    if (location.pathname === successPath) renderSuccess(definition);
    else render(definition);
    // Browsers also restore native inputs on non-bfcache history traversals.
    // Reset after that restoration, including files, without storing answers.
    window.addEventListener("pageshow", () => {
      if (location.pathname !== successPath &&
          (responseCommitted || history.state?.eidosFormCompleted === definition.publicationVersionId)) {
        setTimeout(() => {
          responseCommitted = false;
          render(definition);
          history.replaceState(null, "");
        }, 0);
      }
    });
  } catch (error) {
    root.replaceChildren(
      el(
        "p",
        { class: "status is-error" },
        error instanceof Error ? error.message : "This form is unavailable."
      )
    );
  }
})();`
