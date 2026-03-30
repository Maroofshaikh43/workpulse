import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

export default function RoleManagement() {
  const { supabase, profile } = useOutletContext();
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadUsers = async () => {
    const { data, error: userError } = await supabase
      .from("users")
      .select("id,name,email,department,role,is_active")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false });
    if (userError) {
      setError(userError.message);
      return;
    }
    setUsers(data ?? []);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const updateRole = async (userId, role) => {
    const { error: updateError } = await supabase.from("users").update({ role }).eq("id", userId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("User role updated successfully.");
    loadUsers();
  };

  return (
    <section className="panel">
      <div className="section-header">
        <h2>Role Management</h2>
        <p>Promote employees to HR or Admin directly from this table.</p>
      </div>
      {!!error && <div className="alert error">{error}</div>}
      {!!message && <div className="alert success">{message}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Department</th>
              <th>Active</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.department}</td>
                <td>{user.is_active ? "Yes" : "No"}</td>
                <td>
                  <select value={user.role} onChange={(event) => updateRole(user.id, event.target.value)}>
                    <option value="employee">employee</option>
                    <option value="hr">hr</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td colSpan="5" className="empty-cell">
                  No users available for role management.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
