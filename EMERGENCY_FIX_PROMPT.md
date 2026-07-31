# EMERGENCY FIX PROMPT — NEI AI Chat Critical Bug Fixes

## Context
The previous "enhancement" PR introduced **critical regressions** that broke core functionality:
- **Tool calls don't work at all** (web_search, vault tools, etc.)
- **Streaming + tools = broken** (tools not passed when streaming)
- **Empty response fallback never implemented**
- **Token budget prefetch = fake** (uses hardcoded count anyway)
- **Obsidian requestUrl fallback error handling removed**

## Required Fixes (Priority Order)

---

### 🔴 FIX-01: Restore Tool Calling in Agent Loop (CRITICAL)

**File:** `src/services/agent/agentLoop.ts`

**Problem:** Lines 331-334 pass `undefined` tools when streaming on last iteration.

**Fix:** 
```typescript
// REMOVE STREAMING ON LAST ITERATION WHEN TOOLS ARE NEEDED
// Only stream the FINAL text response (when no tools will be called)
const useStreaming = isLastIteration && settings.enableStreaming && onStreamChunk && !activeTools;
```

**Also fix the streaming function to support tool calls** - but that's complex. Simpler: **disable streaming when tools are available**.

**Better approach:** Never stream when tools might be called. Only stream the final response after all tool calls are done.

```typescript
// Replace lines 330-334 with:
const canStreamFinal = isLastIteration && settings.enableStreaming && onStreamChunk && !activeTools;
const response = canStreamFinal
    ? await sendChatRequestStream(config, messages, undefined, onStreamChunk)
    : await sendChatRequest(config, messages, activeTools);
```

---

### 🔴 FIX-02: Implement Empty Response Detection & Fallback

**File:** `src/services/agent/agentLoop.ts`

**After getting response (both quick and agent modes), ADD:**
```typescript
// Check if response is valid (has content, tools, or reasoning)
if (!this.isResponseValid(response)) {
    console.warn('[AgentLoop] Empty response detected, attempting fallback...');
    // Fallback: retry with minimal prompt, no tools
    const fallbackMessages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        userMsg
    ];
    const fallbackResponse = await sendChatRequest(config, fallbackMessages, undefined);
    if (this.isResponseValid(fallbackResponse)) {
        // Use fallback response
        response.content = fallbackResponse.content;
        response.tool_calls = fallbackResponse.tool_calls;
        response.reasoning = fallbackResponse.reasoning;
        response.usage = fallbackResponse.usage;
    }
}
```

**Apply in both QUICK MODE (after line 269) and AGENT MODE (after line 334).**

---

### 🔴 FIX-03: Restore Obsidian requestUrl Error Handling

**File:** `src/services/llm.ts` - `performPostRequest` function

**Current (broken):**
```typescript
const obsidian = await import("obsidian");
const res = await obsidian.requestUrl({ url, method: "POST", headers, body: bodyStr });
return { status: res.status, text: res.text, json: res.json as Record<string, unknown> };
```

**Fix:**
```typescript
try {
    const obsidian = await import("obsidian");
    const res = await obsidian.requestUrl({ url, method: "POST", headers, body: bodyStr });
    return { status: res.status, text: res.text, json: res.json as Record<string, unknown> };
} catch (e) {
    console.error("[NEI] Obsidian requestUrl failed:", e);
    throw new Error("HTTP POST request failed: both fetch and obsidian.requestUrl unavailable");
}
```

---

### 🟡 FIX-04: IntentRouter computeScore Return Type Consistency

**File:** `src/services/agent/intentRouter.ts`

**Problem:** `computeScore` returns `{totalScore, baseScore, capabilityBonus}` but `classifyIntent` uses `scoreDetails.totalScore`. This is OK actually, but check all callers.

**Verify:** Line 388 in `classifyIntent` uses `scoreDetails.totalScore` - this is correct. But the old `computeScore` returned a number. Make sure no other code calls it expecting a number.

---

### 🟡 FIX-05: Remove Dead Code & Fake Token Budget

**Files:** `src/services/agent/agentLoop.ts`, `src/utils/calc.ts`

**Action:** 
- Either **fully implement** token-budget prefetch using `calculateTokenBudget` from `calc.ts`
- Or **remove** the fake implementation and revert to simple `maxPrefetchedNotes` limit with a clear comment

**Recommendation:** Revert to simple limit for now, add TODO for token budget. The current code at line 208 just uses `settings.maxPrefetchedNotes` anyway.

---

### 🟡 FIX-06: Clean Up Agent Loop - Remove Duplicate Try/Catch

**File:** `src/services/agent/agentLoop.ts`

**Problem:** The entire `run` method is wrapped in a try/catch (lines 155-507) but inner blocks also have try/catch. The outer catch just re-throws. This is fine but adds noise.

**More importantly:** The `isResponseValid` check and fallback logic needs to be inserted at the right places.

---

## 📋 Exact Code Changes Needed

### 1. agentLoop.ts - Agent Mode Tool Calling Fix (around line 330)

```typescript
// REPLACE lines 330-334:
const canStreamFinal = isLastIteration && settings.enableStreaming && onStreamChunk && !activeTools;
const response = canStreamFinal
    ? await sendChatRequestStream(config, messages, undefined, onStreamChunk)
    : await sendChatRequest(config, messages, activeTools);

if (response.usage) {
    totalPromptTokens += response.usage.promptTokens;
    totalCompletionTokens += response.usage.completionTokens;
}

// ADD EMPTY RESPONSE FALLBACK HERE:
if (!this.isResponseValid(response)) {
    console.warn('[AgentLoop] Empty response, attempting fallback without tools...');
    const fallbackResponse = await sendChatRequest(config, [
        { role: "system", content: systemPrompt },
        userMsg
    ], undefined); // No tools
    if (this.isResponseValid(fallbackResponse)) {
        Object.assign(response, fallbackResponse);
    }
}
```

### 2. agentLoop.ts - Quick Mode Empty Response Fix (around line 269)

```typescript
// AFTER getting response in quick mode (after line 269):
if (response.usage) {
    totalPromptTokens += response.usage.promptTokens;
    totalCompletionTokens += response.usage.completionTokens;
}

// ADD EMPTY RESPONSE FALLBACK:
if (!this.isResponseValid(response)) {
    console.warn('[AgentLoop] Quick mode empty response, attempting fallback...');
    const fallbackResponse = await sendChatRequest(config, messages, undefined);
    if (this.isResponseValid(fallbackResponse)) {
        Object.assign(response, fallbackResponse);
    }
}

const responseText = response.content || "";
```

### 3. llm.ts - performPostRequest Fix (lines 19-21)

```typescript
// REPLACE lines 19-21 with:
try {
    const obsidian = await import("obsidian");
    const res = await obsidian.requestUrl({ url, method: "POST", headers, body: bodyStr });
    return { status: res.status, text: res.text, json: res.json as Record<string, unknown> };
} catch (e) {
    console.error("[NEI] Obsidian requestUrl failed:", e);
    throw new Error("HTTP POST request failed: both fetch and obsidian.requestUrl unavailable");
}
```

---

## 🧪 Verification Steps

After fixes, run:
```bash
npm run build    # Must compile clean
npm run test     # All 32 tests must pass
```

**Manual test in Obsidian:**
1. Ask: "Search for latest TypeScript 5.5 features" → Should call `web_search` tool
2. Ask: "Create a note test.md with content hello" → Should call `create_note` tool  
3. Toggle "Контекст из хранилища" OFF → Ask web question → Should NOT prefetch notes
4. Toggle ON → Ask about vault notes → Should prefetch
5. Test streaming: long response should stream properly

---

## ❌ DO NOT

- Add new features
- Change intent router logic beyond fixing return types
- Add new dependencies
- Modify UI beyond what's needed for the toggle (already working)
- Touch the token budget calculation - remove or implement fully later

---

## 🎯 Success Criteria

| Test | Must Pass |
|------|-----------|
| `web_search` tool called for "search for X" | ✅ |
| `create_note` tool called for "create note Y" | ✅ |
| Streaming works for long responses | ✅ |
| Empty response fallback triggers | ✅ |
| No TypeScript errors | ✅ |
| All 32 tests pass | ✅ |
| Bundle < 500KB gzipped | ✅ |

---

**Focus:** Fix the 3 critical bugs (FIX-01, FIX-02, FIX-03). Everything else is cleanup.