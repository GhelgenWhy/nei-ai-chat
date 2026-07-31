# AGENT LOOP FIX — Execute Tool Calls on Final Iteration

## Problem
When the model calls a tool on the **last allowed iteration**, the agent loop treats the tool call as the "final text response" instead of executing it and getting the result. This returns raw tool call JSON to the user.

## Root Cause (agentLoop.ts)
```typescript
// Line 338: No tools passed on last iteration
const activeTools = isLastIteration ? undefined : filteredTools;

// Line 374: Tool calls on last iteration ignored
if (response.tool_calls && response.tool_calls.length > 0 && !isLastIteration) {
```

## Solution — Smart Iteration Handling

**Principles:**
- Zero hardcoding: Don't reserve last iteration just for "final text"
- Intelligence: Let model decide when it's done (no tool calls = done)
- Efficiency: Only add extra iterations if tools were actually called

**Logic:**
1. **Always pass tools** (unless explicitly disabled)
2. **Execute tools on ANY iteration** where model calls them
3. **Only break** when model returns text WITHOUT tool calls
4. **Hard cap** at `maxIterations` for safety

---

## Exact Code Changes

### 1. Fix activeTools Assignment (line 338)

**REPLACE:**
```typescript
const activeTools = isLastIteration ? undefined : filteredTools;
```

**WITH:**
```typescript
// Always pass tools; model decides when to stop calling them
// On last iteration, still allow tools but don't stream
const activeTools = filteredTools;
```

### 2. Fix Tool Execution Condition (line 374)

**REPLACE:**
```typescript
if (response.tool_calls && response.tool_calls.length > 0 && !isLastIteration) {
```

**WITH:**
```typescript
// Execute tools on ANY iteration where model calls them
if (response.tool_calls && response.tool_calls.length > 0) {
```

### 3. Fix Streaming Logic (lines 341-344)

**REPLACE:**
```typescript
const canStreamFinal = isLastIteration && settings.enableStreaming && onStreamChunk && !activeTools;
const response = canStreamFinal
    ? await sendChatRequestStream(config, messages, undefined, onStreamChunk)
    : await sendChatRequest(config, messages, activeTools);
```

**WITH:**
```typescript
// Stream only when: last iteration AND no tools available (model should respond with text)
const canStreamFinal = isLastIteration && settings.enableStreaming && onStreamChunk;
const response = canStreamFinal
    ? await sendChatRequestStream(config, messages, undefined, onStreamChunk)
    : await sendChatRequest(config, messages, activeTools);
```

### 4. Update Fallback JSON Parser Condition (line 447)

**REPLACE:**
```typescript
else if (response.content && this.containsJsonToolCall(response.content) && !isLastIteration) {
```

**WITH:**
```typescript
else if (response.content && this.containsJsonToolCall(response.content)) {
```

### 5. Fix Final Response Condition (lines 509-513)

**REPLACE:**
```typescript
else {
    finalResponseText = response.content || "";
    break;
}
```

**WITH:**
```typescript
else {
    // No tool calls = model is done
    finalResponseText = response.content || "";
    break;
}
```

---

## Resulting Flow

| Iteration | Model Response | Action |
|-----------|---------------|--------|
| 1 | Tool call | Execute tool, continue |
| 2 | Tool call | Execute tool, continue |
| ... | Tool call | Execute tool, continue |
| N | **Text only (no tool_calls)** | **Return as final answer** |
| maxIterations | Tool call | Execute tool, return whatever text comes after (or empty) |

The model **self-terminates** by stopping tool calls. No hardcoded "last iteration = text only".

---

## Safety Guard

Add a final safety check after the loop to prevent returning tool call JSON:

```typescript
// After the while loop (after line 514)
if (finalResponseText && this.containsJsonToolCall(finalResponseText)) {
    // Model returned tool call JSON as text - strip it or return fallback
    console.warn('[AgentLoop] Model returned tool call as final text, truncating');
    finalResponseText = finalResponseText.replace(/```[\s\S]*?```/g, '').trim() 
        || t("agentNoOutput", language);
}
```

---

## Test Cases to Verify

1. **Web search query** → Model calls `web_search` → gets result → returns synthesized answer
2. **Multi-step** → Model calls `search_notes` → calls `read_note` → returns answer  
3. **Max iterations reached with tool call** → Tool executes, final text returned
4. **Empty tool result** → Model continues or returns answer
5. **Streaming** → Final text response streams, tool iterations don't stream

---

## Files Changed
- `src/services/agent/agentLoop.ts` — 5 targeted changes

No other files needed. This follows zero-hardcoding, maximum intelligence principles.