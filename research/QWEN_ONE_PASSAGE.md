# One Full Climb passage with Qwen 3.5 27B (development run)

This run is to decide whether Qwen 3.5 27B replaces Gemma 4 12B for the prototype, and whether the prompt can be frozen. It is a development decision, not a reported model comparison. You still keep its exports: they are research data like any other run.

## 1. Get the model (once)
In a terminal:
```
ollama pull qwen3.5:27b
ollama show qwen3.5:27b
```
`ollama show` should report about 27B parameters with Q4_K_M quantisation, which is about 17 GB of weights. That leaves room in 24 GB for the 16k context.

## 2. Settings (Model panel)
- Local (Ollama) · model **`qwen3.5:27b`** · **2** questions per request · thinking **off** · temperature **0.6**
- Research settings: **Adult** · **Information text** · process-3 strict **on** · meaning check **on**
- Exemplars: leave the library **empty** unless you have reviewed and confirmed them. Note which you chose.

Press **Save**, then **Test connection**. The green line should end with something like
`Model: qwen3.5:27b · 27.4B · Q4_K_M · build 7653528ba5cb · Ollama 0.x`.
Those values are recorded with the run.

## 3. Check it fits on the GPU
Right after Test connection, run `ollama ps` in a terminal. **PROCESSOR must say `100% GPU`.**
If it shows a CPU/GPU split, the run will be very slow. Close other GPU programs (games, Stable Diffusion, a second model) and try again. If it still splits, tell me and we'll lower the context.

## 4. The passage
Choose one adult informational text, 600–1,200 words, with claims, evidence, a comparison and some limitation or counter-point. Record its licence. **Don't** use the spacing-effect exemplar passage.
Paste it, open **Passage details for the research log**, and fill in title, source and licence. Leave "What you asked" empty.

## 5. Run
Click **Research set** (2·3·3·2) and wait until all four processes have loaded. Expect several minutes on a 27B model. Then wait about a minute more for the shadow meaning check.
Answer the questions as a learner would, if you like. That also tests the hints.

## 6. Export and send
From the home screen (**Save & new** first):
- **Full log (JSON)**
- **Candidates (CSV)**
- the passage itself, or its link

## 7. What to look at yourself (5 minutes)
For each process-3 question:
- Do you really need **both** marked places to answer? Or does one sentence give it away?
- Is the relationship (cause, contrast, limitation…) actually in the text, and not invented?

For each process-4 question:
- Is the answer a **judgement with a reason**, such as how well the evidence supports the claim? Or is it just retrieving an evaluative word from the text?
- Could a careful reader defend a second option?

For all questions:
- Is exactly one answer defensible?
- Are the wrong options plausible, not silly?
- Does the first hint send you to the right section without giving the answer away?

Note your impressions in a sentence or two. I'll do a full item-by-item review from the exports.
