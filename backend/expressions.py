"""Optional facial artwork IDs. The seven automation moods stay wire-compatible."""
EXPRESSIONS = frozenset({
    "excited", "proud", "skeptical", "embarrassed", "worried", "relieved",
    "mischievous", "amazed", "confused", "disappointed", "laughing", "zen",
})


def validate_expression(value):
    if value is None:
        return None
    if not isinstance(value, str) or value not in EXPRESSIONS:
        raise ValueError("Unknown facial expression.")
    return value
