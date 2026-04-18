"""
Quantum Random Number Generator using Qiskit.

Uses a single-qubit quantum circuit with a Hadamard gate to produce
a true 50/50 superposition, then measures the result.  The Hadamard gate
puts qubit |0⟩ into the state (|0⟩ + |1⟩)/√2, and measurement collapses
it to either 0 or 1 with equal probability.

Circuit diagram:
     ┌───┐┌─┐
  q: ┤ H ├┤M├
     └───┘└╥┘
  c:       ╚═

This is the core "observation" mechanic — each ship collapse runs
an actual quantum circuit simulation.
"""

from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator


# Persistent simulator instance (avoid re-init overhead per call)
_simulator = AerSimulator()


def quantum_coin_flip() -> int:
    """
    Perform a single quantum coin flip via Hadamard gate + measurement.

    Returns:
        0 or 1, each with ~50% probability, determined by quantum
        circuit simulation.
    """
    # Build the circuit: 1 qubit, 1 classical bit
    qc = QuantumCircuit(1, 1)

    # Apply Hadamard gate → creates superposition |0⟩ + |1⟩ / √2
    qc.h(0)

    # Measure qubit 0 → classical bit 0  (the "observation")
    qc.measure(0, 0)

    # Execute on the Aer simulator with a single shot
    result = _simulator.run(qc, shots=1).result()
    counts = result.get_counts(qc)

    # counts looks like {'0': 1} or {'1': 1}
    measured_bit = int(list(counts.keys())[0])
    return measured_bit


def collapse_superposition() -> str:
    """
    Collapse a ship's superposition state.

    Returns:
        "a" if the ship collapses to Position A (measured 0)
        "b" if the ship collapses to Position B (measured 1)
    """
    bit = quantum_coin_flip()
    return "a" if bit == 0 else "b"


if __name__ == "__main__":
    # Quick test: run 20 collapses to show distribution
    results = [collapse_superposition() for _ in range(20)]
    a_count = results.count("a")
    b_count = results.count("b")
    print(f"20 quantum collapses: A={a_count}, B={b_count}")
    print(f"Results: {results}")
