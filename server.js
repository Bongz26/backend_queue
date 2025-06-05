import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import "./styles/queueStyles.css"; // ✅ Ensures priority styling applies
import { calculateETC } from "./utils/calculateETC";
import { sendWhatsAppNotification } from "./utils/sendWhatsAppNotification";

const BASE_URL = "https://queue-backendser.onrender.com";

const getOrderClass = (category) => {
    if (category === "New Mix") return "urgent";
    if (category === "Reorder Mix") return "warning";
    if (category === "Colour Code") return "standard";
    return "";
};

const Dashboard = () => {
    const [orders, setOrders] = useState([]);
    const [activeOrdersCount, setActiveOrdersCount] = useState(0);

    // ✅ Fetch orders with debugging
    const fetchOrders = useCallback(async () => {
        try {
            console.log("🔄 Fetching orders from API...");
            const response = await axios.get(`${BASE_URL}/api/orders`);
            console.log("📌 Full API Orders Data:", JSON.stringify(response.data, null, 2));

            const updatedOrders = response.data.map(order => ({
                ...order,
                dynamicETC: calculateETC(order.category, activeOrdersCount) || "N/A"
            }));

            setOrders(updatedOrders);
            console.log("📌 Orders after updating React state:", updatedOrders);
        } catch (error) {
            console.error("🚨 Error fetching orders:", error);
        }
    }, [activeOrdersCount]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    return (
        <div className="container mt-4">
            <h1 className="text-center">Paints Queue Dashboard</h1>
            <p>Active Orders: <strong>{activeOrdersCount}</strong></p>

            <table className="table table-bordered">
                <thead>
                    <tr>
                        <th>Transaction ID</th>
                        <th>Color Code</th>
                        <th>Paint Colour</th>
                        <th>Start Time</th> {/* ✅ Restored start time */}
                        <th>ETC</th>
                        <th>Status</th>
                        <th>Client Name</th>
                        <th>Contact</th>
                        <th>Category</th> {/* ✅ Ensuring category is visible */}
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {orders.map(order => (
                        <tr key={order.transaction_id} className={getOrderClass(order.category)}> {/* ✅ Category styling restored */}
                            <td>{order.transaction_id}</td>
                            <td>{order.colour_code !== undefined ? order.colour_code : "N/A"}</td>
                            <td>{order.paint_type}</td>
                            <td>{order.start_time || "N/A"}</td> {/* ✅ Start time restored */}
                            <td>{order.dynamicETC}</td>
                            <td>{order.current_status}</td>
                            <td>{order.customer_name}</td>
                            <td>{order.client_contact}</td>
                            <td>{order.category}</td> {/* ✅ Showing category */}
                            <td>
                                <select
                                    className="form-select"
                                    value={order.current_status}
                                    onChange={(e) => updateStatus(order.transaction_id, e.target.value, order.client_contact)}
                                >
                                    <option value={order.current_status}>{order.current_status}</option>
                                    {!["Mixing", "Ready"].includes(order.current_status) && (
                                        <>
                                            <option value="Mixing">Mixing</option>
                                            <option value="Ready">Ready</option>
                                        </>
                                    )}
                                </select>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default Dashboard;
