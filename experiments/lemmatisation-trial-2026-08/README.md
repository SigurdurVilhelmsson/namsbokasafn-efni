# The first lemmatisation trial (August 2026): Nefnir on chemistry coinages

> **Frozen record, written 2026-10-24 from the trial's notes of 2026-08-19.** The trial was run under the current
> grant, before the Skerfur project starts, so it is pre-existing work at the S tag (Skerfur plan §2). **It was not
> re-run for this record.** Every number below is the trial's own, from a small hand-picked sample.

## What was tested

Nefnir ([`jonfd/nefnir`](https://github.com/jonfd/nefnir), Apache-2.0), a rule-based Icelandic lemmatiser trained
on BÍN: 219 lines of Python with no third-party dependencies, and a rules file with two tiers, 76,690 exact known
forms and 45,225 suffix rules.

The suffix tier is the one that matters here: it lemmatises words it has never seen. Icelandic inflects on the
suffix, and a compound inflects like its head, so Nefnir can handle a new scientific compound without splitting it.

## Method

- Run locally from the published repository.
- Input: 11 inflected forms, each with its correct word-class tag supplied by hand.
- Three control arms: a wrong word-class tag, gibberish, and idempotence (a lemma fed back in should come back
  unchanged).

## Results

**11 of 11 correct.** Seven of the forms are chemistry coinages that are not in BÍN:

| form | lemma |
|---|---|
| kjarnsækisins | kjarnsækir |
| mólarleysninnar | mólarleysni |
| oxósýrunnar | oxósýra |
| efnatengisins | efnatengi |
| vetnistengjanna | vetnistengi |
| kúvettunnar | kúvetta |
| pniktógenanna | pniktógen |

The other four forms are not listed, so this record reproduces no BÍN data.

- **Idempotence:** 4 of 4 lemmas came back unchanged.
- **Wrong tag:** a wrong word-class tag can make a non-word (`kjarnsækisins` with a verb tag gave `kjarnsækisinsva`).
- **Gibberish:** Nefnir lemmatises nonsense by design. It is a normaliser, not a vocabulary filter.

## What it shows, and what it does not

- Matching a form to its lemma works on the kind of coined compound this book is full of, when the tag is right.
- It does not generate forms, so it says nothing about writing an inflected form into a sentence.
- n = 11, hand-picked, with hand-supplied tags, so the result is directional. Tagging, the harder half, was not
  tested.
- Connecting lemmatisation and tagging to Ritstjóri, and measuring them properly, is the Skerfur project's B2
  (`docs/plans/2026-10-23-skerfur-development-plan.md` §4.2). This trial is B2's starting evidence, not part of it.
